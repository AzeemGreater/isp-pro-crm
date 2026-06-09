import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS approval_requests (
      id BIGSERIAL PRIMARY KEY,
      request_type VARCHAR(64) NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      requested_by UUID REFERENCES admins(id),
      reviewed_by UUID REFERENCES admins(id),
      review_notes TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS role_permission_matrix (
      role VARCHAR(24) PRIMARY KEY,
      permissions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO role_permission_matrix (role, permissions_json) VALUES
      ('SuperAdmin', '["*"]'::jsonb),
      ('Admin', '["tickets.manage","plans.manage","inventory.manage","reports.view","approvals.review"]'::jsonb),
      ('Agent', '["tickets.create","subscribers.view","whatsapp.campaign"]'::jsonb),
      ('Viewer', '["dashboard.view","reports.view"]'::jsonb)
    ON CONFLICT (role) DO NOTHING
  `);

  schemaReady = true;
}

async function executeApprovedAction(request: { request_type: string; payload_json: Record<string, unknown> }, reviewerId: string) {
  const payload = request.payload_json || {};

  if (request.request_type === 'wallet_adjustment') {
    const adminId = String(payload.admin_id || '');
    const amount = Number(payload.amount || 0);
    const direction = String(payload.direction || 'credit').toLowerCase();
    const note = String(payload.reason || 'Wallet adjustment via approval flow');

    if (!adminId || amount <= 0) throw new Error('Invalid wallet_adjustment payload');

    const delta = direction === 'debit' ? -amount : amount;
    await pool.query('UPDATE admins SET wallet_balance = wallet_balance + $1 WHERE id = $2', [delta, adminId]);
    await pool.query(
      `INSERT INTO financial_ledger (transaction_type, amount, admin_id, description, payment_method)
       VALUES ($1, $2, $3, $4, 'Approval')`,
      [delta >= 0 ? 'Credit' : 'Debit', Math.abs(delta), adminId, `${note} (approved by ${reviewerId})`]
    );
    return { action: 'wallet_adjustment', admin_id: adminId, amount: delta };
  }

  if (request.request_type === 'refund') {
    const subscriberId = Number(payload.subscriber_id || 0);
    const amount = Number(payload.amount || 0);
    const reason = String(payload.reason || 'Refund via approval flow');

    if (!subscriberId || amount <= 0) throw new Error('Invalid refund payload');

    await pool.query(
      `INSERT INTO financial_ledger (transaction_type, amount, subscriber_id, admin_id, description, payment_method)
       VALUES ('Refund', $1, $2, $3, $4, 'Approval')`,
      [amount, subscriberId, reviewerId, `${reason} (approved)`]
    );
    return { action: 'refund', subscriber_id: subscriberId, amount };
  }

  if (request.request_type === 'plan_override') {
    const subscriberId = Number(payload.subscriber_id || 0);
    const profileId = Number(payload.profile_id || 0);

    if (!subscriberId || !profileId) throw new Error('Invalid plan_override payload');

    await pool.query('UPDATE subscribers SET profile_id = $1, updated_at = NOW() WHERE id = $2', [profileId, subscriberId]);
    return { action: 'plan_override', subscriber_id: subscriberId, profile_id: profileId };
  }

  if (request.request_type === 'disconnect') {
    const subscriberId = Number(payload.subscriber_id || 0);
    const reason = String(payload.reason || 'Disconnected via approval flow');

    if (!subscriberId) throw new Error('Invalid disconnect payload');

    await pool.query('UPDATE subscribers SET status = $1, notes = COALESCE(notes, \'\') || $2, updated_at = NOW() WHERE id = $3', [
      'Disabled',
      `\n[${new Date().toISOString()}] ${reason}`,
      subscriberId,
    ]);
    return { action: 'disconnect', subscriber_id: subscriberId };
  }

  return { action: 'noop', request_type: request.request_type };
}

router.get('/requests', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM approval_requests ORDER BY created_at DESC LIMIT 200');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch approval requests' });
  }
});

router.post('/requests', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { request_type, payload_json = {} } = req.body as { request_type: string; payload_json?: unknown };
    if (!request_type) {
      res.status(400).json({ error: 'request_type is required' });
      return;
    }
    const result = await pool.query(
      'INSERT INTO approval_requests (request_type, payload_json, requested_by) VALUES ($1,$2,$3) RETURNING *',
      [request_type, payload_json, req.admin!.adminId]
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create approval request' });
  }
});

router.patch('/requests/:id/review', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { status, review_notes } = req.body as { status: string; review_notes?: string };
    if (!['approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'status must be approved or rejected' });
      return;
    }
    const existing = await pool.query('SELECT * FROM approval_requests WHERE id = $1', [req.params.id]);
    const current = existing.rows[0];
    if (!current) {
      res.status(404).json({ error: 'Approval request not found' });
      return;
    }

    if (current.status !== 'pending') {
      res.status(409).json({ error: 'Only pending requests can be reviewed' });
      return;
    }

    let executionResult: Record<string, unknown> | null = null;
    if (status === 'approved') {
      executionResult = await executeApprovedAction(
        { request_type: current.request_type, payload_json: current.payload_json || {} },
        req.admin!.adminId
      );
    }

    const result = await pool.query(`
      UPDATE approval_requests
      SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [status, review_notes || null, req.admin!.adminId, req.params.id]);

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Approval request not found' });
      return;
    }

    res.json({ ...result.rows[0], execution_result: executionResult });
  } catch {
    res.status(500).json({ error: 'Failed to review request' });
  }
});

router.get('/permissions', requireRole('SuperAdmin', 'Admin'), async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query('SELECT * FROM role_permission_matrix ORDER BY role');
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch role permissions' });
  }
});

router.put('/permissions/:role', requireRole('SuperAdmin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { permissions_json } = req.body as { permissions_json: unknown };
    const result = await pool.query(`
      INSERT INTO role_permission_matrix (role, permissions_json)
      VALUES ($1,$2)
      ON CONFLICT (role)
      DO UPDATE SET permissions_json = EXCLUDED.permissions_json, updated_at = NOW()
      RETURNING *
    `, [req.params.role, permissions_json || []]);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update role permissions' });
  }
});

export default router;
