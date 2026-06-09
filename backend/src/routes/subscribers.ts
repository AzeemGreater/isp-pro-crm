import { Router, Request, Response } from 'express';
import { pool, transaction } from '../db/pool';
import { authMiddleware, requireRole, isAgentRequest, getActorAdminId } from '../middleware/auth';
import { logger } from '../utils/logger';
import { sendWhatsAppMessage, templates } from '../services/whatsapp.service';

const router = Router();
router.use(authMiddleware);

async function ensureSubscriberOwnerSchema(): Promise<void> {
  await pool.query('ALTER TABLE admins ADD COLUMN IF NOT EXISTS customer_limit INTEGER');
}

function buildInvoiceNumber(prefix: string = 'INV'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

function buildSubscriberWhere(
  search: string,
  status: string,
  agent_id: string,
  profile_id: string
): { where: string; params: unknown[] } {
  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let pIdx = 1;

  if (search) {
    where += ` AND (s.full_name ILIKE $${pIdx} OR s.pppoe_username ILIKE $${pIdx} OR s.mobile ILIKE $${pIdx} OR s.cnic ILIKE $${pIdx})`;
    params.push(`%${search}%`);
    pIdx++;
  }
  if (status) {
    where += ` AND s.status = $${pIdx}`;
    params.push(status);
    pIdx++;
  }
  if (agent_id) {
    where += ` AND s.agent_id = $${pIdx}`;
    params.push(agent_id);
    pIdx++;
  }
  if (profile_id) {
    where += ` AND s.profile_id = $${pIdx}`;
    params.push(profile_id);
  }

  return { where, params };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// GET /api/subscribers — list with pagination, search, filter
router.get('/', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const page    = Math.max(1, parseInt(req.query.page as string || '1'));
    const limit   = Math.min(100, parseInt(req.query.limit as string || '25'));
    const offset  = (page - 1) * limit;
    const search  = (req.query.search as string || '').trim();
    const status  = req.query.status as string;
    const zone_id = req.query.zone_id as string;
    const agent_id = actorAgentId || (req.query.agent_id as string);
    const profile_id = req.query.profile_id as string;

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let pIdx = 1;

    if (search) {
      where += ` AND (s.full_name ILIKE $${pIdx} OR s.pppoe_username ILIKE $${pIdx} OR s.mobile ILIKE $${pIdx} OR s.cnic ILIKE $${pIdx})`;
      params.push(`%${search}%`); pIdx++;
    }
    if (status) { where += ` AND s.status = $${pIdx}`; params.push(status); pIdx++; }
    if (zone_id) { where += ` AND s.zone_id = $${pIdx}`; params.push(zone_id); pIdx++; }
    if (agent_id) { where += ` AND s.agent_id = $${pIdx}`; params.push(agent_id); pIdx++; }
    if (profile_id) { where += ` AND s.profile_id = $${pIdx}`; params.push(profile_id); pIdx++; }

    const [dataRes, countRes] = await Promise.all([
      pool.query(`
        SELECT
          s.id, s.full_name, s.cnic, s.mobile, s.address,
          s.pppoe_username, s.expiration_date, s.status,
          s.created_at, s.updated_at,
          z.area_name   AS zone_name,
          z.zone_code,
          p.name        AS profile_name,
          p.download_speed, p.upload_speed, p.retail_price,
          p.validity_days,
          n.name        AS nas_name,
          n.ip_address  AS nas_ip,
          a.username    AS agent_username,
          (s.expiration_date - CURRENT_DATE) AS days_remaining
        FROM subscribers s
        LEFT JOIN isp_zones z          ON s.zone_id    = z.id
        LEFT JOIN internet_profiles p  ON s.profile_id = p.id
        LEFT JOIN nas_routers n        ON s.nas_id     = n.id
        LEFT JOIN admins a             ON s.agent_id   = a.id
        ${where}
        ORDER BY s.id DESC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM subscribers s ${where}`, params),
    ]);

    res.json({
      data:       dataRes.rows,
      pagination: { page, limit, total: parseInt(countRes.rows[0].count), pages: Math.ceil(parseInt(countRes.rows[0].count) / limit) },
    });
  } catch (err) {
    logger.error('GET /subscribers error:', err);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// GET /api/subscribers/insights/expiring?days=7&limit=10
router.get('/insights/expiring', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const days = Math.max(1, Math.min(60, parseInt((req.query.days as string) || '7')));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || '10')));

    const params: unknown[] = [days];
    let pIdx = 2;
    let where = `
      WHERE s.status IN ('Active', 'Expired')
        AND s.expiration_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
    `;

    if (actorAgentId) {
      where += ` AND s.agent_id = $${pIdx}`;
      params.push(actorAgentId);
      pIdx++;
    }

    params.push(limit);

    const result = await pool.query(`
      SELECT
        s.id,
        s.full_name,
        s.mobile,
        s.pppoe_username,
        s.expiration_date,
        (s.expiration_date - CURRENT_DATE) AS days_remaining,
        p.name AS profile_name,
        p.retail_price,
        z.area_name AS zone_name
      FROM subscribers s
      LEFT JOIN internet_profiles p ON s.profile_id = p.id
      LEFT JOIN isp_zones z ON s.zone_id = z.id
      ${where}
      ORDER BY s.expiration_date ASC, s.id DESC
      LIMIT $${pIdx}
    `, params);

    res.json({
      window_days: days,
      total: result.rowCount,
      data: result.rows,
    });
  } catch (err) {
    logger.error('GET /subscribers/insights/expiring error:', err);
    res.status(500).json({ error: 'Failed to fetch expiring insights' });
  }
});

// GET /api/subscribers/export.csv
router.get('/export.csv', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').trim();
    const agent_id = (req.query.agent_id as string || '').trim();
    const profile_id = (req.query.profile_id as string || '').trim();

    const built = buildSubscriberWhere(search, status, agent_id, profile_id);
    const rows = await pool.query(`
      SELECT
        s.id,
        s.full_name,
        s.mobile,
        s.cnic,
        s.pppoe_username,
        s.status,
        s.expiration_date,
        z.area_name AS zone_name,
        p.name AS profile_name,
        n.name AS nas_name,
        a.username AS agent_username
      FROM subscribers s
      LEFT JOIN isp_zones z ON z.id = s.zone_id
      LEFT JOIN internet_profiles p ON p.id = s.profile_id
      LEFT JOIN nas_routers n ON n.id = s.nas_id
      LEFT JOIN admins a ON a.id = s.agent_id
      ${built.where}
      ORDER BY s.id DESC
    `, built.params);

    const header = [
      'id', 'full_name', 'mobile', 'cnic', 'pppoe_username', 'status',
      'expiration_date', 'zone_name', 'profile_name', 'nas_name', 'agent_username',
    ];
    const lines = [header.join(',')];

    for (const row of rows.rows) {
      lines.push([
        row.id,
        row.full_name,
        row.mobile,
        row.cnic,
        row.pppoe_username,
        row.status,
        row.expiration_date,
        row.zone_name,
        row.profile_name,
        row.nas_name,
        row.agent_username,
      ].map(csvEscape).join(','));
    }

    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="subscribers-export.csv"');
    res.status(200).send(csv);
  } catch (err) {
    logger.error('GET /subscribers/export.csv error:', err);
    res.status(500).json({ error: 'Failed to export subscribers CSV' });
  }
});

// POST /api/subscribers/import
router.post('/import', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const rows = (req.body?.rows || []) as Array<Record<string, string>>;
    const mode = (req.body?.mode as string || 'upsert').toLowerCase();

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'rows array is required' });
      return;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of rows) {
      const username = (raw.pppoe_username || '').trim().toLowerCase();
      const full_name = (raw.full_name || '').trim();
      const mobile = (raw.mobile || '').trim();

      if (!username || !full_name || !mobile) {
        skipped++;
        continue;
      }

      const existing = await pool.query('SELECT id FROM subscribers WHERE pppoe_username = $1', [username]);
      if (existing.rows[0]) {
        if (mode === 'insert-only') {
          skipped++;
          continue;
        }

        await pool.query(`
          UPDATE subscribers
          SET full_name = $1,
              mobile = $2,
              cnic = COALESCE($3, cnic),
              status = COALESCE($4::subscriber_status, status)
          WHERE id = $5
        `, [
          full_name,
          mobile,
          (raw.cnic || '').trim() || null,
          (raw.status || '').trim() || null,
          existing.rows[0].id,
        ]);
        updated++;
      } else {
        const profileRes = await pool.query('SELECT id, validity_days FROM internet_profiles WHERE is_active = true ORDER BY id ASC LIMIT 1');
        const defaultProfile = profileRes.rows[0];
        if (!defaultProfile) {
          skipped++;
          continue;
        }

        const validityDays = Number(defaultProfile.validity_days || 30);
        await pool.query(`
          INSERT INTO subscribers
            (full_name, mobile, cnic, profile_id, pppoe_username, pppoe_password, expiration_date, status, agent_id)
          VALUES
            ($1, $2, $3, $4, $5, $6, CURRENT_DATE + ($7 || ' days')::INTERVAL, COALESCE($8::subscriber_status, 'Active'), $9)
        `, [
          full_name,
          mobile,
          (raw.cnic || '').trim() || null,
          defaultProfile.id,
          username,
          raw.pppoe_password || 'change-me',
          validityDays,
          (raw.status || '').trim() || null,
          req.admin!.adminId,
        ]);
        inserted++;
      }
    }

    res.json({ message: 'Import completed', inserted, updated, skipped, total: rows.length });
  } catch (err) {
    logger.error('POST /subscribers/import error:', err);
    res.status(500).json({ error: 'Failed to import subscriber rows' });
  }
});

// POST /api/subscribers/bulk/preview
router.post('/bulk/preview', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const search = (req.body?.search as string || '').trim();
    const status = (req.body?.status as string || '').trim();
    const agent_id = (req.body?.agent_id as string || '').trim();
    const profile_id = (req.body?.profile_id as string || '').trim();

    const built = buildSubscriberWhere(search, status, agent_id, profile_id);
    const preview = await pool.query(`
      SELECT s.id, s.full_name, s.pppoe_username, s.status, s.expiration_date,
             p.name AS profile_name, n.name AS nas_name, a.username AS agent_username
      FROM subscribers s
      LEFT JOIN internet_profiles p ON p.id = s.profile_id
      LEFT JOIN nas_routers n ON n.id = s.nas_id
      LEFT JOIN admins a ON a.id = s.agent_id
      ${built.where}
      ORDER BY s.id DESC
      LIMIT 200
    `, built.params);

    const count = await pool.query(`SELECT COUNT(*) FROM subscribers s ${built.where}`, built.params);
    res.json({ total: parseInt(count.rows[0].count), data: preview.rows });
  } catch (err) {
    logger.error('POST /subscribers/bulk/preview error:', err);
    res.status(500).json({ error: 'Failed to preview bulk set' });
  }
});

// POST /api/subscribers/bulk/apply
router.post('/bulk/apply', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const ids = (req.body?.ids || []) as number[];
    const search = (req.body?.search as string || '').trim();
    const statusFilter = (req.body?.status as string || '').trim();
    const agentFilter = (req.body?.agent_id as string || '').trim();
    const profileFilter = (req.body?.profile_id as string || '').trim();
    const updates = (req.body?.updates || {}) as Record<string, string | number | null>;

    let targetIds: number[] = [];
    if (Array.isArray(ids) && ids.length > 0) {
      targetIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    } else {
      const built = buildSubscriberWhere(search, statusFilter, agentFilter, profileFilter);
      const idRows = await pool.query(`SELECT s.id FROM subscribers s ${built.where}`, built.params);
      targetIds = idRows.rows.map((r) => Number(r.id));
    }

    if (targetIds.length === 0) {
      res.status(400).json({ error: 'No target subscribers found for bulk operation' });
      return;
    }

    const setParts: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (updates.status) {
      setParts.push(`status = $${pIdx}::subscriber_status`);
      params.push(updates.status);
      pIdx++;
    }
    if (updates.profile_id) {
      setParts.push(`profile_id = $${pIdx}::INTEGER`);
      params.push(updates.profile_id);
      pIdx++;
    }
    if (updates.nas_id) {
      setParts.push(`nas_id = $${pIdx}::INTEGER`);
      params.push(updates.nas_id);
      pIdx++;
    }
    if (updates.agent_id) {
      setParts.push(`agent_id = $${pIdx}::UUID`);
      params.push(updates.agent_id);
      pIdx++;
    }
    if (updates.add_days) {
      setParts.push(`expiration_date = expiration_date + ($${pIdx}::TEXT || ' days')::INTERVAL`);
      params.push(String(updates.add_days));
      pIdx++;
    }

    if (setParts.length === 0) {
      res.status(400).json({ error: 'No updates provided for bulk apply' });
      return;
    }

    params.push(targetIds);
    const updateSql = `
      UPDATE subscribers
      SET ${setParts.join(', ')}
      WHERE id = ANY($${pIdx}::BIGINT[])
      RETURNING id
    `;
    const updated = await pool.query(updateSql, params);

    res.json({ message: 'Bulk operation completed', affected: updated.rowCount || 0 });
  } catch (err) {
    logger.error('POST /subscribers/bulk/apply error:', err);
    res.status(500).json({ error: 'Failed to apply bulk updates' });
  }
});

// POST /api/subscribers/bulk/renew
router.post('/bulk/renew', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const ids = (req.body?.ids || []) as number[];
    const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    let renewed = 0;
    for (const id of uniqueIds) {
      const subRes = await pool.query(
        'SELECT s.id, s.status, s.profile_id, p.validity_days, p.retail_price, p.name AS profile_name FROM subscribers s JOIN internet_profiles p ON p.id = s.profile_id WHERE s.id = $1',
        [id]
      );
      const sub = subRes.rows[0];
      if (!sub) continue;

      const baseDateSql = sub.status === 'Expired' ? 'CURRENT_DATE' : 'expiration_date';
      await pool.query(`
        UPDATE subscribers
        SET expiration_date = ${baseDateSql} + ($1 || ' days')::INTERVAL,
            status = 'Active'
        WHERE id = $2
      `, [sub.validity_days, id]);

      await pool.query(`
        INSERT INTO financial_ledger (transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method)
        VALUES ('Debit', $1, $2, $3, $4, $5, $6, 'Bulk Renewal')
      `, [
        sub.retail_price,
        id,
        req.admin!.adminId,
        sub.profile_id,
        buildInvoiceNumber('BRN'),
        `Bulk renewal - ${sub.profile_name}`,
      ]);
      renewed++;
    }

    res.json({ message: 'Bulk renewal completed', renewed });
  } catch (err) {
    logger.error('POST /subscribers/bulk/renew error:', err);
    res.status(500).json({ error: 'Failed bulk renewal' });
  }
});

// POST /api/subscribers/bulk/delete
router.post('/bulk/delete', requireRole('SuperAdmin'), async (req: Request, res: Response) => {
  try {
    const ids = (req.body?.ids || []) as number[];
    const uniqueIds = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const deleted = await pool.query('DELETE FROM subscribers WHERE id = ANY($1::BIGINT[]) RETURNING id', [uniqueIds]);
    res.json({ message: 'Bulk delete completed', deleted: deleted.rowCount || 0 });
  } catch (err) {
    logger.error('POST /subscribers/bulk/delete error:', err);
    res.status(500).json({ error: 'Failed bulk delete' });
  }
});

// GET /api/subscribers/username/:username
router.get('/username/:username', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const result = await pool.query(`
      SELECT s.*, z.area_name, z.zone_code, p.name AS profile_name, p.download_speed,
             p.upload_speed, p.retail_price, p.validity_days, n.name AS nas_name,
             n.ip_address AS nas_ip, a.username AS agent_username,
             (s.expiration_date - CURRENT_DATE) AS days_remaining
      FROM subscribers s
      LEFT JOIN isp_zones z         ON s.zone_id = z.id
      LEFT JOIN internet_profiles p ON s.profile_id = p.id
      LEFT JOIN nas_routers n       ON s.nas_id = n.id
      LEFT JOIN admins a            ON s.agent_id = a.id
      WHERE LOWER(s.pppoe_username) = $1
        AND ($2::UUID IS NULL OR s.agent_id = $2)
      LIMIT 1
    `, [username, actorAgentId || null]);

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('GET /subscribers/username/:username error:', err);
    res.status(500).json({ error: 'Failed to fetch subscriber by username' });
  }
});

// GET /api/subscribers/username/:username/telemetry
router.get('/username/:username/telemetry', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const username = String(req.params.username || '').trim().toLowerCase();
    const days = Math.max(1, Math.min(90, parseInt((req.query.days as string) || '30')));
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const subAccess = await pool.query(
      `
      SELECT id, pppoe_username
      FROM subscribers
      WHERE LOWER(pppoe_username) = $1
        AND ($2::UUID IS NULL OR agent_id = $2)
      LIMIT 1
      `,
      [username, actorAgentId || null]
    );

    if (!subAccess.rows[0]) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const scopedUsername = String(subAccess.rows[0].pppoe_username || '').toLowerCase();

    const [currentRes, usageRes, logsRes] = await Promise.all([
      pool.query(`
        SELECT
          ra.radacctid,
          ra.username,
          ra.acctstarttime,
          ra.acctupdatetime,
          ra.acctsessiontime,
          COALESCE(ra.acctinputoctets, 0) AS acctinputoctets,
          COALESCE(ra.acctoutputoctets, 0) AS acctoutputoctets,
          ra.framedipaddress::TEXT AS framed_ip,
          ra.callingstationid AS mac_address,
          ra.nasipaddress::TEXT AS nas_ip,
          n.name AS nas_name
        FROM radacct ra
        LEFT JOIN nas_routers n ON n.ip_address::TEXT = ra.nasipaddress::TEXT
        WHERE LOWER(ra.username) = $1
          AND ra.acctstoptime IS NULL
        ORDER BY ra.acctstarttime DESC NULLS LAST
        LIMIT 1
      `, [scopedUsername]),
      pool.query(`
        SELECT
          COALESCE(SUM(ra.acctinputoctets), 0) AS input_octets,
          COALESCE(SUM(ra.acctoutputoctets), 0) AS output_octets,
          MAX(COALESCE(ra.acctupdatetime, ra.acctstoptime, ra.acctstarttime)) AS last_seen
        FROM radacct ra
        WHERE LOWER(ra.username) = $1
          AND ra.acctstarttime >= NOW() - ($2::TEXT || ' days')::INTERVAL
      `, [scopedUsername, days]),
      pool.query(`
        SELECT
          ra.radacctid,
          ra.acctsessionid,
          ra.acctstarttime,
          ra.acctstoptime,
          ra.acctupdatetime,
          COALESCE(ra.acctsessiontime, 0) AS acctsessiontime,
          COALESCE(ra.acctinputoctets, 0) AS acctinputoctets,
          COALESCE(ra.acctoutputoctets, 0) AS acctoutputoctets,
          ra.acctterminatecause,
          ra.framedipaddress::TEXT AS framed_ip,
          ra.callingstationid AS mac_address,
          ra.nasipaddress::TEXT AS nas_ip,
          n.name AS nas_name
        FROM radacct ra
        LEFT JOIN nas_routers n ON n.ip_address::TEXT = ra.nasipaddress::TEXT
        WHERE LOWER(ra.username) = $1
        ORDER BY COALESCE(ra.acctstoptime, ra.acctupdatetime, ra.acctstarttime) DESC
        LIMIT 15
      `, [scopedUsername]),
    ]);

    const current = currentRes.rows[0]
      ? {
          online: true,
          username: currentRes.rows[0].username,
          start_time: currentRes.rows[0].acctstarttime,
          updated_at: currentRes.rows[0].acctupdatetime,
          session_time_seconds: Number(currentRes.rows[0].acctsessiontime || 0),
          input_octets: Number(currentRes.rows[0].acctinputoctets || 0),
          output_octets: Number(currentRes.rows[0].acctoutputoctets || 0),
          framed_ip: currentRes.rows[0].framed_ip || null,
          mac_address: currentRes.rows[0].mac_address || null,
          nas_ip: currentRes.rows[0].nas_ip || null,
          nas_name: currentRes.rows[0].nas_name || null,
        }
      : {
          online: false,
          username: scopedUsername,
          start_time: null,
          updated_at: null,
          session_time_seconds: 0,
          input_octets: 0,
          output_octets: 0,
          framed_ip: null,
          mac_address: null,
          nas_ip: null,
          nas_name: null,
        };

    const usageRow = usageRes.rows[0] || { input_octets: 0, output_octets: 0, last_seen: null };
    const usageInput = Number(usageRow.input_octets || 0);
    const usageOutput = Number(usageRow.output_octets || 0);

    const sessions = logsRes.rows.map((row) => {
      const inputOctets = Number(row.acctinputoctets || 0);
      const outputOctets = Number(row.acctoutputoctets || 0);
      return {
        radacctid: Number(row.radacctid),
        acctsessionid: row.acctsessionid,
        start_time: row.acctstarttime,
        stop_time: row.acctstoptime,
        updated_at: row.acctupdatetime,
        session_time_seconds: Number(row.acctsessiontime || 0),
        input_octets: inputOctets,
        output_octets: outputOctets,
        input_gb: Number((inputOctets / (1024 * 1024 * 1024)).toFixed(2)),
        output_gb: Number((outputOctets / (1024 * 1024 * 1024)).toFixed(2)),
        total_gb: Number(((inputOctets + outputOctets) / (1024 * 1024 * 1024)).toFixed(2)),
        terminate_cause: row.acctterminatecause || null,
        framed_ip: row.framed_ip || null,
        mac_address: row.mac_address || null,
        nas_ip: row.nas_ip || null,
        nas_name: row.nas_name || null,
      };
    });

    res.json({
          username: scopedUsername,
      current,
      usage_window: {
        window_days: days,
        input_octets: usageInput,
        output_octets: usageOutput,
        input_gb: Number((usageInput / (1024 * 1024 * 1024)).toFixed(2)),
        output_gb: Number((usageOutput / (1024 * 1024 * 1024)).toFixed(2)),
        total_gb: Number(((usageInput + usageOutput) / (1024 * 1024 * 1024)).toFixed(2)),
        last_seen: usageRow.last_seen || null,
      },
      usage_30d: {
        input_octets: usageInput,
        output_octets: usageOutput,
        input_gb: Number((usageInput / (1024 * 1024 * 1024)).toFixed(2)),
        output_gb: Number((usageOutput / (1024 * 1024 * 1024)).toFixed(2)),
        total_gb: Number(((usageInput + usageOutput) / (1024 * 1024 * 1024)).toFixed(2)),
        last_seen: usageRow.last_seen || null,
      },
      sessions,
    });
  } catch (err) {
    logger.error('GET /subscribers/username/:username/telemetry error:', err);
    res.status(500).json({ error: 'Failed to fetch subscriber telemetry' });
  }
});

// GET /api/subscribers/username/:username/timeline
router.get('/username/:username/timeline', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const username = String(req.params.username || '').trim().toLowerCase();
    const limit = Math.max(10, Math.min(200, parseInt((req.query.limit as string) || '60')));
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const subRes = await pool.query(
      `
      SELECT id, full_name, pppoe_username
      FROM subscribers
      WHERE LOWER(pppoe_username) = $1
        AND ($2::UUID IS NULL OR agent_id = $2)
      LIMIT 1
      `,
      [username, actorAgentId || null]
    );
    if (!subRes.rows[0]) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const subscriberId = Number(subRes.rows[0].id);

    const [ledgerRes, sessionRes, waRes, auditRes] = await Promise.all([
      pool.query(`
        SELECT id, created_at, date, transaction_type, amount, description, invoice_number, payment_method
        FROM financial_ledger
        WHERE subscriber_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [subscriberId, limit]),
      pool.query(`
        SELECT
          radacctid,
          acctstarttime,
          acctstoptime,
          acctupdatetime,
          acctsessiontime,
          COALESCE(acctinputoctets, 0) AS acctinputoctets,
          COALESCE(acctoutputoctets, 0) AS acctoutputoctets,
          framedipaddress::TEXT AS framed_ip,
          nasipaddress::TEXT AS nas_ip,
          acctterminatecause
        FROM radacct
        WHERE LOWER(username) = $1
        ORDER BY COALESCE(acctstoptime, acctupdatetime, acctstarttime) DESC
        LIMIT $2
      `, [username, limit]),
      pool.query(`
        SELECT id, created_at, sent_at, message_type, status, phone, error_message
        FROM whatsapp_logs
        WHERE subscriber_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [subscriberId, limit]),
      pool.query(`
        SELECT id, created_at, action, entity_type, entity_id, old_values, new_values
        FROM audit_log
        WHERE (entity_type IN ('subscriber', 'subscribers') AND entity_id = $1::TEXT)
           OR LOWER(entity_id) = $2
        ORDER BY created_at DESC
        LIMIT $3
      `, [subscriberId, username, limit]),
    ]);

    const events = [
      ...ledgerRes.rows.map((row) => ({
        id: `ledger-${row.id}`,
        type: 'billing',
        timestamp: row.created_at || row.date,
        title: `${row.transaction_type} Rs. ${Number(row.amount || 0).toLocaleString()}`,
        description: row.description || 'Ledger transaction',
        meta: {
          invoice_number: row.invoice_number || null,
          payment_method: row.payment_method || null,
        },
      })),
      ...sessionRes.rows.map((row) => {
        const inputOctets = Number(row.acctinputoctets || 0);
        const outputOctets = Number(row.acctoutputoctets || 0);
        const totalGb = Number(((inputOctets + outputOctets) / (1024 * 1024 * 1024)).toFixed(2));
        return {
          id: `session-${row.radacctid}`,
          type: 'session',
          timestamp: row.acctstoptime || row.acctupdatetime || row.acctstarttime,
          title: row.acctstoptime ? 'Session Ended' : 'Session Active',
          description: `IP ${row.framed_ip || '-'} · Data ${totalGb} GB`,
          meta: {
            nas_ip: row.nas_ip || null,
            terminate_cause: row.acctterminatecause || null,
            session_time_seconds: Number(row.acctsessiontime || 0),
          },
        };
      }),
      ...waRes.rows.map((row) => ({
        id: `wa-${row.id}`,
        type: 'whatsapp',
        timestamp: row.sent_at || row.created_at,
        title: `WhatsApp ${String(row.status || '').toUpperCase()}`,
        description: `${row.message_type || 'message'} to ${row.phone || '-'}`,
        meta: {
          error_message: row.error_message || null,
        },
      })),
      ...auditRes.rows.map((row) => ({
        id: `audit-${row.id}`,
        type: 'audit',
        timestamp: row.created_at,
        title: `Action: ${row.action || 'Update'}`,
        description: `${row.entity_type || 'entity'} ${row.entity_id || ''}`.trim(),
        meta: {
          old_values: row.old_values || null,
          new_values: row.new_values || null,
        },
      })),
    ]
      .filter((e) => e.timestamp)
      .sort((a, b) => new Date(String(b.timestamp)).getTime() - new Date(String(a.timestamp)).getTime())
      .slice(0, limit);

    res.json({
      subscriber: {
        id: subscriberId,
        full_name: subRes.rows[0].full_name,
        username: subRes.rows[0].pppoe_username,
      },
      total_events: events.length,
      data: events,
    });
  } catch (err) {
    logger.error('GET /subscribers/username/:username/timeline error:', err);
    res.status(500).json({ error: 'Failed to fetch subscriber timeline' });
  }
});

// GET /api/subscribers/username/:username/predictor
router.get('/username/:username/predictor', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const subRes = await pool.query(
      `
      SELECT
        id,
        full_name,
        status,
        expiration_date,
        (expiration_date - CURRENT_DATE) AS days_remaining
      FROM subscribers
      WHERE LOWER(pppoe_username) = $1
        AND ($2::UUID IS NULL OR agent_id = $2)
      LIMIT 1
      `,
      [username, actorAgentId || null]
    );

    if (!subRes.rows[0]) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const subscriberId = Number(subRes.rows[0].id);

    const [usage30Res, usagePrev30Res, renewCountRes, failedReminderRes, lastSeenRes] = await Promise.all([
      pool.query(
        `
        SELECT COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) AS total_octets
        FROM radacct
        WHERE LOWER(username) = $1
          AND acctstarttime >= NOW() - INTERVAL '30 days'
        `,
        [username]
      ),
      pool.query(
        `
        SELECT COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) AS total_octets
        FROM radacct
        WHERE LOWER(username) = $1
          AND acctstarttime < NOW() - INTERVAL '30 days'
          AND acctstarttime >= NOW() - INTERVAL '60 days'
        `,
        [username]
      ),
      pool.query(
        `
        SELECT COUNT(*)::INT AS renewals_90d
        FROM financial_ledger
        WHERE subscriber_id = $1
          AND transaction_type = 'Debit'
          AND date >= CURRENT_DATE - INTERVAL '90 days'
          AND LOWER(COALESCE(description, '')) LIKE '%renew%'
        `,
        [subscriberId]
      ),
      pool.query(
        `
        SELECT COUNT(*)::INT AS failed_reminders_30d
        FROM whatsapp_logs
        WHERE subscriber_id = $1
          AND status = 'failed'
          AND created_at >= NOW() - INTERVAL '30 days'
          AND (
            message_type IN ('expiry_3d', 'expiry_1d')
            OR LOWER(COALESCE(message_type, '')) LIKE '%expiry%'
            OR LOWER(COALESCE(message_type, '')) LIKE '%reminder%'
          )
        `,
        [subscriberId]
      ),
      pool.query(
        `
        SELECT MAX(COALESCE(acctupdatetime, acctstoptime, acctstarttime)) AS last_seen
        FROM radacct
        WHERE LOWER(username) = $1
        `,
        [username]
      ),
    ]);

    const daysRemaining = Number(subRes.rows[0].days_remaining || 0);
    const usage30 = Number(usage30Res.rows[0]?.total_octets || 0);
    const usagePrev30 = Number(usagePrev30Res.rows[0]?.total_octets || 0);
    const renewals90d = Number(renewCountRes.rows[0]?.renewals_90d || 0);
    const failedReminders30d = Number(failedReminderRes.rows[0]?.failed_reminders_30d || 0);
    const lastSeen = lastSeenRes.rows[0]?.last_seen || null;

    let score = 0;
    const reasons: string[] = [];

    if (subRes.rows[0].status !== 'Active') {
      score += 45;
      reasons.push(`Status is ${subRes.rows[0].status}`);
    }

    if (daysRemaining <= 0) {
      score += 35;
      reasons.push('Subscription already expired');
    } else if (daysRemaining <= 3) {
      score += 25;
      reasons.push('Expiry within 3 days');
    } else if (daysRemaining <= 7) {
      score += 15;
      reasons.push('Expiry within 7 days');
    } else if (daysRemaining <= 15) {
      score += 8;
      reasons.push('Expiry within 15 days');
    }

    let usageDropPercent = 0;
    if (usagePrev30 > 0) {
      usageDropPercent = Number((((usagePrev30 - usage30) / usagePrev30) * 100).toFixed(2));
      if (usageDropPercent >= 50) {
        score += 15;
        reasons.push(`Usage dropped ${usageDropPercent}% vs previous 30 days`);
      } else if (usageDropPercent >= 30) {
        score += 10;
        reasons.push(`Usage dropped ${usageDropPercent}% vs previous 30 days`);
      }
    }

    if (renewals90d === 0) {
      score += 8;
      reasons.push('No renewal activity in last 90 days');
    }

    if (failedReminders30d > 0) {
      const reminderWeight = Math.min(10, failedReminders30d * 2);
      score += reminderWeight;
      reasons.push(`${failedReminders30d} failed reminder delivery attempts`);
    }

    if (lastSeen) {
      const lastSeenTime = new Date(String(lastSeen)).getTime();
      const daysSinceSeen = Math.floor((Date.now() - lastSeenTime) / (1000 * 60 * 60 * 24));
      if (daysSinceSeen >= 15) {
        score += 10;
        reasons.push(`No active sessions for ${daysSinceSeen} days`);
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
    let recommendation = 'Maintain regular follow-up and renewal reminders.';

    if (score >= 70) {
      riskLevel = 'High';
      recommendation = 'Immediate retention action recommended: direct contact and renewal incentive.';
    } else if (score >= 40) {
      riskLevel = 'Medium';
      recommendation = 'Schedule proactive reminder and monitor usage/engagement trend.';
    }

    res.json({
      subscriber: {
        id: subscriberId,
        full_name: subRes.rows[0].full_name,
        username,
        status: subRes.rows[0].status,
        expiration_date: subRes.rows[0].expiration_date,
        days_remaining: daysRemaining,
      },
      score,
      risk_level: riskLevel,
      reasons,
      recommendation,
      metrics: {
        usage_30d_gb: Number((usage30 / (1024 * 1024 * 1024)).toFixed(2)),
        usage_prev_30d_gb: Number((usagePrev30 / (1024 * 1024 * 1024)).toFixed(2)),
        usage_drop_percent: usageDropPercent,
        renewals_90d: renewals90d,
        failed_reminders_30d: failedReminders30d,
        last_seen: lastSeen,
      },
    });
  } catch (err) {
    logger.error('GET /subscribers/username/:username/predictor error:', err);
    res.status(500).json({ error: 'Failed to fetch renewal predictor' });
  }
});

// GET /api/subscribers/stats/overview
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const result = await pool.query(`
      SELECT
        COUNT(*)                                                      AS total,
        COUNT(*) FILTER (WHERE status = 'Active')                    AS active,
        COUNT(*) FILTER (WHERE status = 'Expired')                   AS expired,
        COUNT(*) FILTER (WHERE status = 'Disabled')                  AS disabled,
        COUNT(*) FILTER (WHERE expiration_date = CURRENT_DATE + 3)  AS expiring_3d,
        COUNT(*) FILTER (WHERE expiration_date = CURRENT_DATE + 1)  AS expiring_1d,
        COUNT(*) FILTER (WHERE expiration_date = CURRENT_DATE)      AS expiring_today
      FROM subscribers
      WHERE ($1::UUID IS NULL OR agent_id = $1)
    `, [actorAgentId || null]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/subscribers/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const result = await pool.query(`
      SELECT s.*, z.area_name, z.zone_code, p.name AS profile_name, p.download_speed,
             p.upload_speed, p.retail_price, p.validity_days, n.name AS nas_name,
             n.ip_address AS nas_ip, a.username AS agent_username,
             (s.expiration_date - CURRENT_DATE) AS days_remaining
      FROM subscribers s
      LEFT JOIN isp_zones z         ON s.zone_id = z.id
      LEFT JOIN internet_profiles p ON s.profile_id = p.id
      LEFT JOIN nas_routers n       ON s.nas_id = n.id
      LEFT JOIN admins a            ON s.agent_id = a.id
      WHERE s.id = $1
        AND ($2::UUID IS NULL OR s.agent_id = $2)
    `, [req.params.id, actorAgentId || null]);

    if (!result.rows[0]) { res.status(404).json({ error: 'Subscriber not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscriber' });
  }
});

// POST /api/subscribers — create new subscriber
router.post('/', async (req: Request, res: Response) => {
  try {
    await ensureSubscriberOwnerSchema();
    const {
      full_name, cnic, mobile, alt_mobile, email, address,
      id_card_number,
      zone_id, nas_id, olt_id, profile_id, agent_id,
      pppoe_username, pppoe_password,
      static_ip, mac_address, onu_serial, onu_port, notes,
    } = req.body as Record<string, string>;

    // Validate required fields
    if (!full_name || !mobile || !profile_id || !pppoe_username || !pppoe_password) {
      res.status(400).json({ error: 'Missing required fields: full_name, mobile, profile_id, pppoe_username, pppoe_password' });
      return;
    }

    // Fetch profile to calculate expiration date
    const profileRes = await pool.query('SELECT validity_days FROM internet_profiles WHERE id = $1', [profile_id]);
    if (!profileRes.rows[0]) { res.status(400).json({ error: 'Invalid profile_id' }); return; }
    const validityDays = profileRes.rows[0].validity_days;

    const ownerAdminId = (req.admin?.role === 'Agent')
      ? req.admin.adminId
      : ((agent_id || '').trim() || req.admin!.adminId);

    const ownerRes = await pool.query(
      'SELECT id, role, customer_limit FROM admins WHERE id = $1',
      [ownerAdminId]
    );
    if (!ownerRes.rows[0]) {
      res.status(400).json({ error: 'Invalid agent_id/owner account' });
      return;
    }

    const ownerRole = ownerRes.rows[0].role as string;
    const customerLimit = ownerRes.rows[0].customer_limit !== null
      ? Number(ownerRes.rows[0].customer_limit)
      : null;

    if (ownerRole === 'Agent' && customerLimit !== null) {
      const usageRes = await pool.query(
        'SELECT COUNT(*)::INT AS customers_used FROM subscribers WHERE agent_id = $1',
        [ownerAdminId]
      );
      const used = Number(usageRes.rows[0]?.customers_used || 0);
      if (used >= customerLimit) {
        res.status(409).json({
          error: 'Customer limit reached for this subdealer account',
          customer_limit: customerLimit,
          customers_used: used,
        });
        return;
      }
    }

    const idCard = (id_card_number || cnic || alt_mobile || '').trim();

    const sub = await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO subscribers
          (full_name, cnic, mobile, alt_mobile, email, address,
           zone_id, nas_id, olt_id, profile_id,
           pppoe_username, pppoe_password,
           static_ip, mac_address, onu_serial, onu_port,
           expiration_date, status, agent_id, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                CURRENT_DATE + ($17 || ' days')::INTERVAL,
                'Active', $18, $19)
        RETURNING *
      `, [
        full_name, idCard || null, mobile, null, email || null, address || null,
        zone_id || null, nas_id || null, olt_id || null, profile_id,
        pppoe_username.toLowerCase().trim(), pppoe_password,
        static_ip || null, mac_address || null, onu_serial || null, onu_port || null,
        validityDays,
        ownerAdminId, notes || null,
      ]);
      return result.rows[0];
    });

    // Log the activation in ledger
    const priceRes = await pool.query('SELECT retail_price FROM internet_profiles WHERE id=$1', [profile_id]);
    await pool.query(`
      INSERT INTO financial_ledger (transaction_type, amount, subscriber_id, admin_id, profile_id, description, payment_method)
      VALUES ('Credit', $1, $2, $3, $4, 'New subscriber activation', 'Cash')
    `, [priceRes.rows[0].retail_price, sub.id, req.admin!.adminId, profile_id]);

    // Auto-attach mobile number into WhatsApp workflow via welcome message log/send.
    const planRes = await pool.query('SELECT name FROM internet_profiles WHERE id=$1', [profile_id]);
    const planName = planRes.rows[0]?.name || 'Internet Plan';
    const welcomeMessage = templates.welcome(full_name, pppoe_username.toLowerCase().trim(), planName, String(sub.expiration_date));
    const waResult = await sendWhatsAppMessage({ phone: mobile, message: welcomeMessage });

    await pool.query(
      `INSERT INTO whatsapp_logs (subscriber_id, phone, message_type, status, wa_message_id, sent_at, error_message)
       VALUES ($1,$2,'welcome',$3,$4,$5,$6)`,
      [
        sub.id,
        mobile,
        waResult.success ? 'sent' : 'failed',
        waResult.messageId || null,
        waResult.success ? new Date() : null,
        waResult.error || null,
      ]
    );

    logger.info(`New subscriber created: ${pppoe_username} by admin ${req.admin!.username} (owner=${ownerAdminId})`);
    res.status(201).json(sub);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ error: 'PPPoE username or CNIC already exists' });
      return;
    }
    logger.error('POST /subscribers error:', err);
    res.status(500).json({ error: 'Failed to create subscriber' });
  }
});

// PUT /api/subscribers/:id — full update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const { id } = req.params;
    const { full_name, mobile, alt_mobile, cnic, id_card_number, email, address, zone_id, nas_id, profile_id, status, notes } = req.body as Record<string, string>;

    const idCard = (id_card_number || cnic || alt_mobile || '').trim();

    const result = await pool.query(`
      UPDATE subscribers SET
        full_name = COALESCE($1, full_name),
        mobile    = COALESCE($2, mobile),
        cnic      = $3,
        alt_mobile = NULL,
        email = $4, address = $5,
        zone_id    = COALESCE($6::INTEGER, zone_id),
        nas_id     = COALESCE($7::INTEGER, nas_id),
        profile_id = COALESCE($8::INTEGER, profile_id),
        status     = COALESCE($9::subscriber_status, status),
        notes      = $10
      WHERE id = $11
        AND ($12::UUID IS NULL OR agent_id = $12)
      RETURNING *
    `, [full_name, mobile, idCard || null, email || null, address || null,
        zone_id || null, nas_id || null, profile_id || null,
        status || null, notes || null, id, actorAgentId || null]);

    if (!result.rows[0]) { res.status(404).json({ error: 'Subscriber not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update subscriber' });
  }
});

// POST /api/subscribers/:id/renew — renew subscription
router.post('/:id/renew', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payment_method = 'Cash' } = req.body as { payment_method?: string };
    const actor = req.admin;

    if (!actor) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const actorAgentId = actor.role === 'Agent' ? actor.adminId : '';

    const sub = await transaction(async (client) => {
      const subRes = await client.query(
        'SELECT s.*, p.retail_price, p.validity_days, p.name AS profile_name FROM subscribers s JOIN internet_profiles p ON s.profile_id = p.id WHERE s.id = $1 AND ($2::UUID IS NULL OR s.agent_id = $2) FOR UPDATE',
        [id, actorAgentId || null]
      );
      if (!subRes.rows[0]) throw new Error('Subscriber not found');
      const s = subRes.rows[0];
      const renewalAmount = parseFloat(s.retail_price);

      // Agents must have enough wallet balance before renewal.
      if (actor.role === 'Agent') {
        const walletRes = await client.query(
          'SELECT wallet_balance FROM admins WHERE id = $1 FOR UPDATE',
          [actor.adminId]
        );

        if (!walletRes.rows[0]) {
          throw new Error('Admin not found');
        }

        const currentBalance = parseFloat(walletRes.rows[0].wallet_balance);
        if (currentBalance < renewalAmount) {
          throw new Error('Insufficient wallet balance');
        }

        await client.query(
          'UPDATE admins SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [renewalAmount, actor.adminId]
        );
      }

      // Extend from today if expired, else from current expiry
      const baseDate = s.status === 'Expired' ? 'CURRENT_DATE' : 'expiration_date';
      const updated = await client.query(`
        UPDATE subscribers
        SET expiration_date = ${baseDate} + ($1 || ' days')::INTERVAL,
            status = 'Active'
        WHERE id = $2
        RETURNING *
      `, [s.validity_days, id]);

      // Log debit in ledger
      await client.query(`
        INSERT INTO financial_ledger (transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method)
        VALUES ('Debit', $1, $2, $3, $4, $5, $6, $7)
      `, [
        renewalAmount,
        id,
        actor.adminId,
        s.profile_id,
        buildInvoiceNumber('REN'),
        `Monthly renewal - ${s.profile_name}`,
        payment_method,
      ]);

      return updated.rows[0];
    });

    logger.info(`Subscriber ${id} renewed by ${actor.username}`);
    res.json({ message: 'Renewed successfully', subscriber: sub });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Subscriber not found') {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }
    if (err instanceof Error && err.message === 'Insufficient wallet balance') {
      res.status(402).json({ error: 'Insufficient wallet balance for renewal' });
      return;
    }
    if (err instanceof Error && err.message === 'Admin not found') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    logger.error('Renewal error:', err);
    res.status(500).json({ error: 'Failed to renew subscriber' });
  }
});

// PATCH /api/subscribers/:id/status — toggle Active/Disabled
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const { status } = req.body as { status: string };
    const validStatuses = ['Active', 'Expired', 'Disabled', 'Suspended'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    const result = await pool.query(
      'UPDATE subscribers SET status = $1 WHERE id = $2 AND ($3::UUID IS NULL OR agent_id = $3) RETURNING id, pppoe_username, status',
      [status, req.params.id, actorAgentId || null]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Subscriber not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/subscribers/:id
router.delete('/:id', requireRole('SuperAdmin'), async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM subscribers WHERE id = $1 RETURNING id, pppoe_username', [req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: 'Subscriber not found' }); return; }
    res.json({ message: 'Subscriber deleted', deleted: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

export default router;
