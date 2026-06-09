import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';
import { sendWhatsAppMessage, sendBulkWhatsApp, WhatsAppMessage, initWhatsApp, getConnectionStatus, disconnectWhatsApp } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);

const templateCatalog = [
  {
    key: 'welcome',
    label: 'Welcome Activation',
    body: '🎉 Welcome {name}! Your account is now active. Plan: {plan}. PPPoE: {pppoeUser}. Valid till: {expiry}.',
  },
  {
    key: 'renewal_reminder',
    label: 'Renewal Reminder',
    body: '⏰ Dear {name}, your internet expires on {expiry}. Renewal amount: Rs. {price}. Please renew to avoid interruption.',
  },
  {
    key: 'payment_receipt',
    label: 'Payment Receipt',
    body: '✅ Payment received, {name}. Invoice: {invoice}. Amount: Rs. {amount}. Plan: {plan}. New expiry: {expiry}.',
  },
  {
    key: 'service_alert',
    label: 'Service Alert',
    body: '🚨 Service update for {name}: {message}. For support call {support}.',
  },
  {
    key: 'network_maintenance',
    label: 'Maintenance Notice',
    body: '🛠️ Dear {name}, scheduled maintenance on {date} between {window}. Temporary impact is possible.',
  },
] as const;

function applyTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_m, key: string) => variables[key] ?? `{${key}}`);
}

// GET /api/whatsapp/templates — available message templates
router.get('/templates', requireRole('SuperAdmin', 'Admin'), (_req: Request, res: Response) => {
  res.json(templateCatalog);
});

// POST /api/whatsapp/send-template — send single message using a template
router.post('/send-template', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { phone, template_key, variables = {}, subscriber_id } = req.body as {
      phone: string;
      template_key: string;
      variables?: Record<string, string>;
      subscriber_id?: number;
    };

    if (!phone || !template_key) {
      res.status(400).json({ error: 'phone and template_key are required' });
      return;
    }

    const template = templateCatalog.find((item) => item.key === template_key);
    if (!template) {
      res.status(400).json({ error: 'Invalid template_key' });
      return;
    }

    const message = applyTemplate(template.body, variables);
    const result = await sendWhatsAppMessage({ phone, message });

    await pool.query(
      `INSERT INTO whatsapp_logs (subscriber_id, phone, message_type, status, wa_message_id, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [subscriber_id || null, phone, `template:${template_key}`, result.success ? 'sent' : 'failed', result.messageId || null]
    );

    res.json({ ...result, template_key, message });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Template send failed' });
  }
});

// POST /api/whatsapp/send — send a single message
router.post('/send', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { phone, message, subscriber_id } = req.body as {
      phone: string; message: string; subscriber_id?: number;
    };

    if (!phone || !message) {
      res.status(400).json({ error: 'phone and message are required' }); return;
    }

    const result = await sendWhatsAppMessage({ phone, message });

    // Log to DB
    await pool.query(
      `INSERT INTO whatsapp_logs (subscriber_id, phone, message_type, status, wa_message_id, sent_at)
       VALUES ($1, $2, 'manual', $3, $4, NOW())`,
      [subscriber_id || null, phone, result.success ? 'sent' : 'failed', result.messageId || null]
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Send failed' });
  }
});

// POST /api/whatsapp/bulk — bulk campaign with safe mode
router.post('/bulk', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const {
      message, zone_id, status_filter, safe_mode = true,
      min_delay_sec = 10, max_delay_sec = 20,
    } = req.body as {
      message: string; zone_id?: number; status_filter?: string;
      safe_mode?: boolean; min_delay_sec?: number; max_delay_sec?: number;
    };

    if (!message) { res.status(400).json({ error: 'message is required' }); return; }

    // Build subscriber query
    let where = "WHERE s.mobile IS NOT NULL AND s.mobile != ''";
    const params: unknown[] = [];
    let pIdx = 1;
    if (zone_id)       { where += ` AND s.zone_id = $${pIdx}`; params.push(zone_id); pIdx++; }
    if (status_filter) { where += ` AND s.status = $${pIdx}`;  params.push(status_filter); pIdx++; }

    const subsRes = await pool.query(
      `SELECT id, full_name, mobile FROM subscribers ${where} ORDER BY id`,
      params
    );

    const recipients: WhatsAppMessage[] = subsRes.rows.map(s => ({
      phone:   s.mobile,
      message: message.replace('{name}', s.full_name),
    }));

    // Respond immediately with queue info — bulk sends in background
    res.json({
      message:    'Bulk campaign queued',
      total:      recipients.length,
      safe_mode,
      estimated_minutes: safe_mode ? Math.ceil(recipients.length * ((min_delay_sec + max_delay_sec) / 2) / 60) : 0,
    });

    // Fire-and-forget bulk send
    sendBulkWhatsApp(recipients, {
      safeMode: safe_mode, minDelaySec: min_delay_sec, maxDelaySec: max_delay_sec,
      onSent: async (msg, result, index) => {
        await pool.query(
          `INSERT INTO whatsapp_logs (phone, message_type, status, wa_message_id, sent_at)
           VALUES ($1, 'bulk', $2, $3, NOW())`,
          [msg.phone, result.success ? 'sent' : 'failed', result.messageId || null]
        );
        logger.debug(`Bulk WA [${index + 1}/${recipients.length}] → ${msg.phone}: ${result.success ? 'OK' : 'FAIL'}`);
      },
    }).catch(err => logger.error('Bulk campaign error:', err));

  } catch (err) {
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

// GET /api/whatsapp/logs — message history
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit as string || '50'));
    const result = await pool.query(`
      SELECT wl.*, s.full_name FROM whatsapp_logs wl
      LEFT JOIN subscribers s ON wl.subscriber_id = s.id
      ORDER BY wl.created_at DESC LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch logs' }); }
});

// GET /api/whatsapp/status — WhatsApp connection status
router.get('/status', (_req, res) => {
  res.json(getConnectionStatus());
});

// POST /api/whatsapp/connect — initialize/reinitialize Baileys
router.post('/connect', requireRole('SuperAdmin', 'Admin'), async (_req: Request, res: Response) => {
  try {
    await initWhatsApp(true);
    res.json(getConnectionStatus());
  } catch (err) {
    res.status(500).json({ connected: false, status: 'error', error: err instanceof Error ? err.message : 'Connect failed' });
  }
});

// POST /api/whatsapp/disconnect — disconnect active Baileys socket
router.post('/disconnect', requireRole('SuperAdmin', 'Admin'), async (_req: Request, res: Response) => {
  try {
    await disconnectWhatsApp();
    res.json(getConnectionStatus());
  } catch (err) {
    res.status(500).json({ connected: false, status: 'error', error: err instanceof Error ? err.message : 'Disconnect failed' });
  }
});

// GET /api/whatsapp/qr-image — return QR as embeddable image data URI
router.get('/qr-image', (_req: Request, res: Response) => {
  const status = getConnectionStatus();
  if (status.status !== 'qr_ready' || !status.qr) {
    res.status(404).json({ error: 'QR not available' });
    return;
  }

  const qr_url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(status.qr)}`;
  res.json({ qr_url, qr: status.qr });
});

// POST /api/whatsapp/pair/reset — clears session and starts fresh QR pairing
router.post('/pair/reset', requireRole('SuperAdmin', 'Admin'), async (_req: Request, res: Response) => {
  try {
    await disconnectWhatsApp();
    await initWhatsApp(true);
    res.json(getConnectionStatus());
  } catch (err) {
    res.status(500).json({ connected: false, status: 'error', error: err instanceof Error ? err.message : 'Pair reset failed' });
  }
});

export default router;
