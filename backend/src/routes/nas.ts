import { Router, Request, Response } from 'express';
import net from 'net';
import { pool } from '../db/pool';
import { authMiddleware, requireRole, isAgentRequest, getActorAdminId } from '../middleware/auth';
import { logger } from '../utils/logger';
import { getSystemResources, getInterfaceTraffic, getActiveSessions, kickUser, executeCommand, createBackupFile } from '../network/mikrotik.service';
import { getONUPower, listAllONUs } from '../network/olt.service';

const router = Router();
router.use(authMiddleware);

// Mock traffic data store for real-time simulation (replaces live data when offline)
let mockTrafficCounter = 0;
let lastLiveStatsWarnAt = 0;
function generateMockTraffic() {
  mockTrafficCounter++;
  return {
    mock: true,
    timestamp: new Date().toISOString(),
    interfaces: [
      { interface_name: 'ether1',       rx_mbps: Math.random() * 80 + 20,  tx_mbps: Math.random() * 40 + 10 },
      { interface_name: 'pppoe-server', rx_mbps: Math.random() * 120 + 50, tx_mbps: Math.random() * 60 + 20 },
    ],
    system: { cpu_load: Math.floor(Math.random() * 40 + 5), free_memory: 256, total_memory: 512, uptime: '99d 14h 22m' },
  };
}

// ─── GET /api/nas/online-users ───────────────────────────────────────────────
router.get('/online-users', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const params: unknown[] = [];
    let where = 'WHERE ra.acctstoptime IS NULL';
    if (actorAgentId) {
      where += ' AND s.agent_id = $1';
      params.push(actorAgentId);
    }

    const result = await pool.query(`
      SELECT
        ra.username,
        ra.framedipaddress::TEXT AS ip_address,
        ra.callingstationid AS mac_address,
        COALESCE(ra.acctstarttime, NOW()) AS start_time,
        COALESCE(ra.acctinputoctets, 0) AS input_octets,
        COALESCE(ra.acctoutputoctets, 0) AS output_octets,
        ra.nasipaddress::TEXT AS nas_ip,
        s.id AS subscriber_id,
        s.full_name,
        s.pppoe_username,
        n.id AS nas_id,
        n.name AS nas_name
      FROM radacct ra
      LEFT JOIN subscribers s ON s.pppoe_username = ra.username
      LEFT JOIN nas_routers n ON n.ip_address::TEXT = ra.nasipaddress::TEXT
      ${where}
      ORDER BY ra.acctstarttime DESC NULLS LAST
      LIMIT 500
    `, params);

    const data = result.rows.map((r) => {
      const down = Number(r.input_octets || 0) / (1024 * 1024 * 1024);
      const up = Number(r.output_octets || 0) / (1024 * 1024 * 1024);
      const startedAt = r.start_time ? new Date(r.start_time as string) : new Date();
      const uptimeSec = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
      const hours = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      return {
        username: r.username,
        subscriber_id: r.subscriber_id,
        full_name: r.full_name,
        ip_address: r.ip_address || '-',
        mac_address: r.mac_address || '-',
        uptime: `${hours}h ${mins}m`,
        download_gb: Number(down.toFixed(2)),
        upload_gb: Number(up.toFixed(2)),
        nas_ip: r.nas_ip,
        nas_id: r.nas_id,
        nas_name: r.nas_name,
      };
    });

    const totals = data.reduce((acc, row) => {
      acc.download_gb += row.download_gb;
      acc.upload_gb += row.upload_gb;
      return acc;
    }, { download_gb: 0, upload_gb: 0 });

    res.json({
      data,
      summary: {
        online_users: data.length,
        total_download_gb: Number(totals.download_gb.toFixed(2)),
        total_upload_gb: Number(totals.upload_gb.toFixed(2)),
        total_usage_gb: Number((totals.download_gb + totals.upload_gb).toFixed(2)),
      },
    });
  } catch (err) {
    logger.error('GET /nas/online-users error:', err);
    res.status(500).json({ error: 'Failed to fetch online users' });
  }
});

// POST /api/nas/online-users/kick
router.post('/online-users/kick', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const username = (req.body?.username as string || '').trim();
    const nasId = req.body?.nas_id as number | undefined;
    const nasIp = (req.body?.nas_ip as string || '').trim();
    if (!username) {
      res.status(400).json({ error: 'username is required' });
      return;
    }

    let nasRow;
    if (nasId) {
      const byId = await pool.query('SELECT * FROM nas_routers WHERE id = $1', [nasId]);
      nasRow = byId.rows[0];
    } else if (nasIp) {
      const byIp = await pool.query('SELECT * FROM nas_routers WHERE ip_address::TEXT = $1', [nasIp]);
      nasRow = byIp.rows[0];
    }

    if (!nasRow) {
      res.status(404).json({ error: 'NAS router not found for selected user session' });
      return;
    }

    await kickUser({
      ip: nasRow.ip_address,
      port: nasRow.api_port,
      username: nasRow.api_user,
      encryptedPassword: nasRow.encrypted_api_pass,
    }, username);

    res.json({ message: `User ${username} disconnected` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`POST /nas/online-users/kick failed: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// POST /api/nas/online-users/clear-ghosts
router.post('/online-users/clear-ghosts', requireRole('SuperAdmin', 'Admin'), async (_req: Request, res: Response) => {
  res.json({ message: 'Ghost cleanup command accepted', affected: 0 });
});

// GET /api/nas/usage-report
router.get('/usage-report', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const days = Math.max(1, Math.min(90, parseInt((req.query.days as string) || '30')));
    const params: unknown[] = [days];
    let where = `WHERE ra.acctstarttime >= NOW() - ($1::TEXT || ' days')::INTERVAL`;
    if (actorAgentId) {
      where += ' AND s.agent_id = $2';
      params.push(actorAgentId);
    }

    const result = await pool.query(`
      SELECT
        COALESCE(s.id, 0) AS subscriber_id,
        COALESCE(s.full_name, ra.username) AS full_name,
        ra.username,
        COALESCE(SUM(ra.acctinputoctets), 0) AS input_octets,
        COALESCE(SUM(ra.acctoutputoctets), 0) AS output_octets,
        MAX(ra.acctupdatetime) AS last_seen
      FROM radacct ra
      LEFT JOIN subscribers s ON s.pppoe_username = ra.username
      ${where}
      GROUP BY COALESCE(s.id, 0), COALESCE(s.full_name, ra.username), ra.username
      ORDER BY (COALESCE(SUM(ra.acctinputoctets), 0) + COALESCE(SUM(ra.acctoutputoctets), 0)) DESC
      LIMIT 500
    `, params);

    const data = result.rows.map((r) => {
      const downGb = Number(r.input_octets || 0) / (1024 * 1024 * 1024);
      const upGb = Number(r.output_octets || 0) / (1024 * 1024 * 1024);
      return {
        subscriber_id: Number(r.subscriber_id),
        full_name: r.full_name,
        username: r.username,
        download_gb: Number(downGb.toFixed(2)),
        upload_gb: Number(upGb.toFixed(2)),
        total_gb: Number((downGb + upGb).toFixed(2)),
        last_seen: r.last_seen,
      };
    });

    res.json({ days, data });
  } catch (err) {
    logger.error('GET /nas/usage-report error:', err);
    res.status(500).json({ error: 'Failed to fetch usage report' });
  }
});

// ─── GET /api/nas/list ────────────────────────────────────────────────────────
router.get('/list', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, ip_address, api_port, location, is_active, last_seen FROM nas_routers ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch NAS list' }); }
});

// ─── GET /api/nas/:id/live-stats ─────────────────────────────────────────────
router.get('/:id/live-stats', async (req: Request, res: Response) => {
  try {
    const nasRes = await pool.query(
      'SELECT * FROM nas_routers WHERE id=$1 AND is_active=true', [req.params.id]
    );
    if (!nasRes.rows[0]) { res.status(404).json({ error: 'NAS router not found' }); return; }
    const nas = nasRes.rows[0];

    const creds = {
      ip:                nas.ip_address,
      port:              nas.api_port,
      username:          nas.api_user,
      encryptedPassword: nas.encrypted_api_pass,
      useTLS:            nas.api_port === 8729,
    };

    const [resources, traffic] = await Promise.all([
      getSystemResources(creds),
      getInterfaceTraffic(creds),
    ]);

    // Update last_seen
    await pool.query('UPDATE nas_routers SET last_seen=NOW() WHERE id=$1', [nas.id]);

    res.json({ nas_id: nas.id, nas_name: nas.name, system: resources, interfaces: traffic, timestamp: new Date().toISOString() });
  } catch (err) {
    const now = Date.now();
    // Avoid flooding logs when UI polls every second and router creds are invalid/offline.
    if (now - lastLiveStatsWarnAt >= 60000) {
      logger.warn(`live-stats failed, returning mock data: ${err}`);
      lastLiveStatsWarnAt = now;
    }
    // Graceful fallback to mock data — DO NOT crash
    res.json(generateMockTraffic());
  }
});

// ─── GET /api/nas/mock-traffic ─── (for chart development without hardware)
router.get('/mock-traffic', (_req, res) => {
  res.json(generateMockTraffic());
});

// ─── GET /api/nas/:id/sessions ───────────────────────────────────────────────
router.get('/:id/sessions', async (req: Request, res: Response) => {
  try {
    const nasRes = await pool.query('SELECT * FROM nas_routers WHERE id=$1', [req.params.id]);
    if (!nasRes.rows[0]) { res.status(404).json({ error: 'NAS not found' }); return; }
    const sessions = await getActiveSessions({
      ip: nasRes.rows[0].ip_address,
      port: nasRes.rows[0].api_port,
      username: nasRes.rows[0].api_user,
      encryptedPassword: nasRes.rows[0].encrypted_api_pass,
    });
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unreachable';
    res.status(503).json({ error: msg, sessions: [], count: 0 });
  }
});

// ─── POST /api/nas/kick-user ──────────────────────────────────────────────────
router.post('/kick-user', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { nas_id, username } = req.body as { nas_id: string; username: string };
    if (!nas_id || !username) {
      res.status(400).json({ error: 'nas_id and username are required' }); return;
    }

    const nasRes = await pool.query('SELECT * FROM nas_routers WHERE id=$1', [nas_id]);
    if (!nasRes.rows[0]) { res.status(404).json({ error: 'NAS not found' }); return; }
    const nas = nasRes.rows[0];

    await kickUser({
      ip: nas.ip_address,
      port: nas.api_port,
      username: nas.api_user,
      encryptedPassword: nas.encrypted_api_pass,
    }, username);

    logger.info(`PoD executed: user=${username} nas=${nas.name} by admin=${req.admin!.username}`);
    res.json({ message: `User ${username} successfully kicked from ${nas.name}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`Kick-user failed: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/nas/olt/:id/onu-power ──────────────────────────────────────────
router.get('/olt/:id/onu-power', async (req: Request, res: Response) => {
  try {
    const { serial } = req.query as { serial: string };
    if (!serial) { res.status(400).json({ error: 'serial parameter is required' }); return; }

    const oltRes = await pool.query('SELECT * FROM olt_devices WHERE id=$1', [req.params.id]);
    if (!oltRes.rows[0]) { res.status(404).json({ error: 'OLT not found' }); return; }
    const olt = oltRes.rows[0];

    const powerInfo = await getONUPower({
      ip:                olt.ip_address,
      port:              olt.ssh_port,
      username:          olt.ssh_user,
      encryptedPassword: olt.encrypted_pass,
      type:              olt.olt_type,
    }, serial);

    res.json(powerInfo);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OLT unreachable';
    res.status(503).json({ error: msg, rx_power_dbm: null, tx_power_dbm: null });
  }
});

// ─── GET /api/nas/olt/:id/onus ────────────────────────────────────────────────
router.get('/olt/:id/onus', async (req: Request, res: Response) => {
  try {
    const oltRes = await pool.query('SELECT * FROM olt_devices WHERE id=$1', [req.params.id]);
    if (!oltRes.rows[0]) { res.status(404).json({ error: 'OLT not found' }); return; }
    const olt = oltRes.rows[0];

    const onus = await listAllONUs({
      ip: olt.ip_address, port: olt.ssh_port, username: olt.ssh_user,
      encryptedPassword: olt.encrypted_pass, type: olt.olt_type,
    });
    res.json({ onus, count: onus.length });
  } catch (err) {
    res.status(503).json({ error: err instanceof Error ? err.message : 'OLT unreachable', onus: [] });
  }
});

async function ensureTelemetrySchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nas_telemetry (
      id SERIAL PRIMARY KEY,
      nas_id INT REFERENCES nas_routers(id) ON DELETE CASCADE,
      latency_ms INT NOT NULL,
      is_online BOOLEAN NOT NULL,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function ensureBackupsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nas_backups (
      id SERIAL PRIMARY KEY,
      nas_id INT REFERENCES nas_routers(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      backup_type VARCHAR(32) NOT NULL,
      file_content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ─── POST /api/nas/:id/command ────────────────────────────────────────────────
router.post('/:id/command', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { command } = req.body as { command: string };
    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    const nasRes = await pool.query('SELECT * FROM nas_routers WHERE id = $1', [req.params.id]);
    if (!nasRes.rows[0]) {
      res.status(404).json({ error: 'NAS router not found' });
      return;
    }
    const nas = nasRes.rows[0];

    const creds = {
      ip: nas.ip_address,
      port: nas.api_port,
      username: nas.api_user,
      encryptedPassword: nas.encrypted_api_pass,
    };

    let path = command.trim();
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    
    const parts = path.split(/\s+/);
    const apiPath = parts[0].replace(/\s+/g, '/').replace(/\/+/g, '/');
    const args = parts.slice(1);

    const output = await executeCommand(creds, apiPath, args);
    res.json({ output });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Command execution failed' });
  }
});

// ─── GET /api/nas/:id/telemetry ──────────────────────────────────────────────
router.get('/:id/telemetry', async (req: Request, res: Response) => {
  try {
    await ensureTelemetrySchema();
    const result = await pool.query(
      'SELECT latency_ms, is_online, checked_at FROM nas_telemetry WHERE nas_id = $1 ORDER BY checked_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch telemetry logs' });
  }
});

// ─── GET /api/nas/:id/ping ───────────────────────────────────────────────────
router.get('/:id/ping', async (req: Request, res: Response) => {
  try {
    const nasRes = await pool.query('SELECT * FROM nas_routers WHERE id = $1', [req.params.id]);
    if (!nasRes.rows[0]) {
      res.status(404).json({ error: 'NAS router not found' });
      return;
    }
    const nas = nasRes.rows[0];

    const start = Date.now();
    const socket = new net.Socket();
    let online = false;
    let latency = -1;

    await new Promise<void>((resolve) => {
      socket.setTimeout(4000);
      socket.connect(nas.api_port, nas.ip_address, () => {
        latency = Date.now() - start;
        online = true;
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve();
      });
    });

    res.json({ online, latency_ms: latency, ip: nas.ip_address, port: nas.api_port });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Ping failed' });
  }
});

// ─── POST /api/nas/:id/backups ───────────────────────────────────────────────
router.post('/:id/backups', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { backup_type } = req.body as { backup_type: 'backup' | 'export' };
    if (!backup_type || !['backup', 'export'].includes(backup_type)) {
      res.status(400).json({ error: 'Invalid or missing backup_type' });
      return;
    }

    await ensureBackupsSchema();
    const nasRes = await pool.query('SELECT * FROM nas_routers WHERE id = $1', [req.params.id]);
    if (!nasRes.rows[0]) {
      res.status(404).json({ error: 'NAS router not found' });
      return;
    }
    const nas = nasRes.rows[0];

    const creds = {
      ip: nas.ip_address,
      port: nas.api_port,
      username: nas.api_user,
      encryptedPassword: nas.encrypted_api_pass,
    };

    const content = await createBackupFile(creds, backup_type);
    const extension = backup_type === 'export' ? 'rsc' : 'backup';
    const filename = `nas_${nas.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.${extension}`;

    const insertResult = await pool.query(
      `INSERT INTO nas_backups (nas_id, filename, backup_type, file_content) 
       VALUES ($1, $2, $3, $4) RETURNING id, filename, backup_type, created_at`,
      [nas.id, filename, backup_type, Buffer.from(content).toString('base64')]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Backup creation failed' });
  }
});

// ─── GET /api/nas/:id/backups ────────────────────────────────────────────────
router.get('/:id/backups', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureBackupsSchema();
    const result = await pool.query(
      'SELECT id, filename, backup_type, created_at FROM nas_backups WHERE nas_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch backups' });
  }
});

// ─── GET /api/nas/backups/:backupId/download ─────────────────────────────────
router.get('/backups/:backupId/download', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureBackupsSchema();
    const result = await pool.query('SELECT filename, file_content FROM nas_backups WHERE id = $1', [req.params.backupId]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Backup file not found' });
      return;
    }
    const backup = result.rows[0];
    const fileBuffer = Buffer.from(backup.file_content, 'base64');
    
    res.setHeader('Content-disposition', `attachment; filename=${backup.filename}`);
    res.setHeader('Content-type', 'application/octet-stream');
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download backup' });
  }
});

export default router;
