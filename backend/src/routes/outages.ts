import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sendBulkWhatsApp } from '../services/whatsapp.service';

const router = Router();
router.use(authMiddleware);

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS outage_incidents (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      details TEXT,
      severity VARCHAR(16) NOT NULL DEFAULT 'medium',
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      zone_id INTEGER REFERENCES isp_zones(id),
      nas_id INTEGER REFERENCES nas_routers(id),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      created_by UUID REFERENCES admins(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS outage_broadcast_logs (
      id BIGSERIAL PRIMARY KEY,
      incident_id BIGINT REFERENCES outage_incidents(id) ON DELETE CASCADE,
      channel VARCHAR(24) NOT NULL,
      recipients INTEGER NOT NULL DEFAULT 0,
      sent_by UUID REFERENCES admins(id),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS outage_broadcast_messages (
      id BIGSERIAL PRIMARY KEY,
      incident_id BIGINT REFERENCES outage_incidents(id) ON DELETE CASCADE,
      recipient_phone VARCHAR(32) NOT NULL,
      recipient_name VARCHAR(128),
      status VARCHAR(16) NOT NULL,
      wa_message_id VARCHAR(128),
      error_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_outage_broadcast_messages_incident
      ON outage_broadcast_messages(incident_id, created_at DESC);
  `);
  schemaReady = true;
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM outage_incidents ORDER BY started_at DESC LIMIT 100');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

router.post('/', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { title, details, severity = 'medium', zone_id, nas_id } = req.body as Record<string, string>;
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const result = await pool.query(`
      INSERT INTO outage_incidents (title, details, severity, zone_id, nas_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [title, details || null, severity, zone_id || null, nas_id || null, req.admin!.adminId]);
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

router.patch('/:id/resolve', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query(`
      UPDATE outage_incidents
      SET status = 'resolved', resolved_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to resolve incident' });
  }
});

router.post('/:id/broadcast', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const incidentRes = await pool.query('SELECT * FROM outage_incidents WHERE id = $1', [req.params.id]);
    const incident = incidentRes.rows[0];
    if (!incident) {
      res.status(404).json({ error: 'Incident not found' });
      return;
    }

    const whereParts: string[] = ['mobile IS NOT NULL', "mobile != ''"];
    const params: unknown[] = [];
    let i = 1;
    if (incident.zone_id) {
      whereParts.push(`zone_id = $${i++}`);
      params.push(incident.zone_id);
    }
    if (incident.nas_id) {
      whereParts.push(`nas_id = $${i++}`);
      params.push(incident.nas_id);
    }

    const subsRes = await pool.query(`SELECT full_name, mobile FROM subscribers WHERE ${whereParts.join(' AND ')}`, params);
    const recipients = subsRes.rows.length;

    const message = `Service Alert: ${incident.title}. ${incident.details || 'Our team is working to restore service quickly.'}`;

    const broadcastPayload = subsRes.rows.map((s) => ({
      full_name: String(s.full_name || ''),
      phone: String(s.mobile || ''),
      message: message.replace('{name}', String(s.full_name || 'Customer')),
    }));

    sendBulkWhatsApp(
      broadcastPayload.map((s) => ({ phone: s.phone, message: s.message })),
      {
        safeMode: true,
        minDelaySec: 8,
        maxDelaySec: 15,
        onSent: async (_msg, result, index) => {
          const recipient = broadcastPayload[index];
          await pool.query(
            `INSERT INTO outage_broadcast_messages (incident_id, recipient_phone, recipient_name, status, wa_message_id, error_text)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
              req.params.id,
              recipient.phone,
              recipient.full_name || null,
              result.success ? 'sent' : 'failed',
              result.messageId || null,
              result.error || null,
            ]
          );
        },
      }
    ).catch(() => undefined);

    await pool.query(
      'INSERT INTO outage_broadcast_logs (incident_id, channel, recipients, sent_by) VALUES ($1,$2,$3,$4)',
      [req.params.id, 'whatsapp', recipients, req.admin!.adminId]
    );

    res.json({ queued: true, recipients });
  } catch {
    res.status(500).json({ error: 'Failed to queue outage broadcast' });
  }
});

router.get('/broadcast/logs', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM outage_broadcast_logs ORDER BY sent_at DESC LIMIT 100');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch broadcast logs' });
  }
});

router.get('/broadcast/messages/:incidentId', async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query(
      'SELECT * FROM outage_broadcast_messages WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 500',
      [req.params.incidentId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch broadcast message logs' });
  }
});

export default router;
