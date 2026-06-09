import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id BIGSERIAL PRIMARY KEY,
      subscriber_id BIGINT REFERENCES subscribers(id),
      title VARCHAR(180) NOT NULL,
      description TEXT,
      category VARCHAR(64) NOT NULL DEFAULT 'general',
      priority VARCHAR(16) NOT NULL DEFAULT 'medium',
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      sla_hours INTEGER NOT NULL DEFAULT 24,
      due_at TIMESTAMPTZ,
      assigned_to UUID REFERENCES admins(id),
      created_by UUID NOT NULL REFERENCES admins(id),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_due_at ON support_tickets(due_at);
  `);
  schemaReady = true;
}

async function runEscalationWorkflow() {
  await ensureSchema();

  const assignee = await pool.query(`
    SELECT a.id
    FROM admins a
    LEFT JOIN support_tickets t
      ON t.assigned_to = a.id
      AND t.status IN ('open', 'in_progress', 'escalated')
    WHERE a.is_active = true
      AND a.role IN ('SuperAdmin', 'Admin')
    GROUP BY a.id
    ORDER BY COUNT(t.id) ASC, a.id
    LIMIT 1
  `);

  const assigneeId = assignee.rows[0]?.id || null;

  const result = await pool.query(`
    UPDATE support_tickets
    SET status = 'escalated',
        assigned_to = COALESCE(assigned_to, $1),
        updated_at = NOW()
    WHERE status IN ('open', 'in_progress')
      AND due_at IS NOT NULL
      AND due_at < NOW()
    RETURNING id
  `, [assigneeId]);

  return {
    escalated: result.rowCount || 0,
    auto_assigned_to: assigneeId,
  };
}

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    await runEscalationWorkflow();
    const result = await pool.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE status IN ('open','in_progress','escalated'))::INT AS open,
        COUNT(*) FILTER (WHERE status = 'resolved')::INT AS resolved,
        COUNT(*) FILTER (WHERE status IN ('open','in_progress','escalated') AND due_at < NOW())::INT AS overdue,
        COUNT(*) FILTER (WHERE status = 'escalated')::INT AS escalated
      FROM support_tickets
    `);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to fetch ticket stats' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    await runEscalationWorkflow();
    const result = await pool.query(`
      SELECT t.*, s.full_name AS subscriber_name, a.full_name AS assigned_to_name
      FROM support_tickets t
      LEFT JOIN subscribers s ON s.id = t.subscriber_id
      LEFT JOIN admins a ON a.id = t.assigned_to
      ORDER BY t.created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.post('/escalation/run', requireRole('SuperAdmin', 'Admin'), async (_req: Request, res: Response) => {
  try {
    const result = await runEscalationWorkflow();
    res.json({ message: 'Escalation workflow executed', ...result });
  } catch {
    res.status(500).json({ error: 'Failed to run escalation workflow' });
  }
});

router.post('/', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { subscriber_id, title, description, category = 'general', priority = 'medium', sla_hours = 24 } = req.body as Record<string, string | number>;
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const result = await pool.query(`
      INSERT INTO support_tickets (subscriber_id, title, description, category, priority, sla_hours, due_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,NOW() + ($6 || ' hours')::INTERVAL,$7)
      RETURNING *
    `, [subscriber_id || null, title, description || null, category, priority, sla_hours, req.admin!.adminId]);

    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.patch('/:id/status', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { status } = req.body as { status: string };
    const result = await pool.query(`
      UPDATE support_tickets
      SET status = $1,
          resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

router.patch('/:id/assign', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { assigned_to } = req.body as { assigned_to: string };
    const result = await pool.query(
      'UPDATE support_tickets SET assigned_to = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [assigned_to, 'in_progress', req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to assign ticket' });
  }
});

export default router;
