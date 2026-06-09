import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id BIGSERIAL PRIMARY KEY,
      item_type VARCHAR(32) NOT NULL,
      brand VARCHAR(64),
      model VARCHAR(64),
      serial_no VARCHAR(128) UNIQUE,
      mac_address VARCHAR(32),
      status VARCHAR(24) NOT NULL DEFAULT 'in_stock',
      subscriber_id BIGINT REFERENCES subscribers(id),
      assigned_at TIMESTAMPTZ,
      notes TEXT,
      created_by UUID REFERENCES admins(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_items(status);
  `);
  schemaReady = true;
}

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query(`
      SELECT
        COUNT(*)::INT AS total,
        COUNT(*) FILTER (WHERE status = 'in_stock')::INT AS in_stock,
        COUNT(*) FILTER (WHERE status = 'assigned')::INT AS assigned,
        COUNT(*) FILTER (WHERE status = 'rma')::INT AS rma
      FROM inventory_items
    `);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to fetch inventory stats' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query(`
      SELECT i.*, s.full_name AS subscriber_name, s.pppoe_username
      FROM inventory_items i
      LEFT JOIN subscribers s ON s.id = i.subscriber_id
      ORDER BY i.created_at DESC
      LIMIT 300
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

router.post('/', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { item_type, brand, model, serial_no, mac_address, notes } = req.body as Record<string, string>;
    if (!item_type || !serial_no) {
      res.status(400).json({ error: 'item_type and serial_no are required' });
      return;
    }
    const result = await pool.query(`
      INSERT INTO inventory_items (item_type, brand, model, serial_no, mac_address, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [item_type, brand || null, model || null, serial_no, mac_address || null, notes || null, req.admin!.adminId]);
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to create inventory item' });
  }
});

router.post('/:id/assign', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const { subscriber_id } = req.body as { subscriber_id: number };
    const result = await pool.query(`
      UPDATE inventory_items
      SET subscriber_id = $1, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [subscriber_id, req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to assign inventory item' });
  }
});

router.post('/:id/unassign', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureSchema();
    const result = await pool.query(`
      UPDATE inventory_items
      SET subscriber_id = NULL, status = 'in_stock', assigned_at = NULL, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Failed to unassign inventory item' });
  }
});

export default router;
