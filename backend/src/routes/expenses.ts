import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

async function ensureExpenseSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS office_expenses (
      id BIGSERIAL PRIMARY KEY,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      category VARCHAR(64) NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      description TEXT NOT NULL,
      vendor VARCHAR(128),
      payment_method VARCHAR(32),
      reference_no VARCHAR(64),
      created_by UUID REFERENCES admins(id),
      updated_by UUID REFERENCES admins(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_office_expenses_date ON office_expenses(expense_date DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_office_expenses_category ON office_expenses(category)');
}

// GET /api/expenses
router.get('/', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    await ensureExpenseSchema();

    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '25', 10)));
    const offset = (page - 1) * limit;
    const search = ((req.query.search as string) || '').trim();
    const category = ((req.query.category as string) || '').trim();
    const from = ((req.query.from as string) || '').trim();
    const to = ((req.query.to as string) || '').trim();

    const whereParts: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      whereParts.push(`(e.description ILIKE $${idx} OR e.vendor ILIKE $${idx} OR e.reference_no ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (category) {
      whereParts.push(`e.category = $${idx}`);
      params.push(category);
      idx++;
    }
    if (from) {
      whereParts.push(`e.expense_date >= $${idx}::date`);
      params.push(from);
      idx++;
    }
    if (to) {
      whereParts.push(`e.expense_date <= $${idx}::date`);
      params.push(to);
      idx++;
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const listParams = [...params, limit, offset];
    const listResult = await pool.query(
      `SELECT e.*, a.full_name AS created_by_name
       FROM office_expenses e
       LEFT JOIN admins a ON a.id = e.created_by
       ${where}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      listParams
    );

    const totalResult = await pool.query(`SELECT COUNT(*)::INT AS total FROM office_expenses e ${where}`, params);
    const summaryResult = await pool.query(
      `SELECT
         COALESCE(SUM(e.amount), 0)::NUMERIC(12,2) AS total_amount,
         COALESCE(SUM(e.amount) FILTER (WHERE DATE_TRUNC('month', e.expense_date) = DATE_TRUNC('month', CURRENT_DATE)), 0)::NUMERIC(12,2) AS current_month_amount,
         COUNT(*)::INT AS total_count
       FROM office_expenses e
       ${where}`,
      params
    );

    res.json({
      data: listResult.rows,
      pagination: {
        page,
        limit,
        total: totalResult.rows[0]?.total || 0,
      },
      summary: summaryResult.rows[0] || { total_amount: '0.00', current_month_amount: '0.00', total_count: 0 },
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch office expenses' });
  }
});

// GET /api/expenses/summary
router.get('/summary', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    await ensureExpenseSchema();

    const from = ((req.query.from as string) || '').trim();
    const to = ((req.query.to as string) || '').trim();

    const whereParts: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (from) {
      whereParts.push(`expense_date >= $${idx}::date`);
      params.push(from);
      idx++;
    }
    if (to) {
      whereParts.push(`expense_date <= $${idx}::date`);
      params.push(to);
      idx++;
    }

    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT category, COUNT(*)::INT AS entries, COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total_amount
       FROM office_expenses
       ${where}
       GROUP BY category
       ORDER BY total_amount DESC, category ASC`,
      params
    );

    res.json({ data: result.rows });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch expense summary' });
  }
});

// POST /api/expenses
router.post('/', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureExpenseSchema();

    const {
      expense_date,
      category,
      amount,
      description,
      vendor,
      payment_method,
      reference_no,
    } = req.body as Record<string, string | number>;

    if (!category || !amount || !description) {
      res.status(400).json({ error: 'category, amount and description are required' });
      return;
    }

    const actor = req.admin!;
    const insertResult = await pool.query(
      `INSERT INTO office_expenses
        (expense_date, category, amount, description, vendor, payment_method, reference_no, created_by, updated_by)
       VALUES
        (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING *`,
      [expense_date || null, category, amount, description, vendor || null, payment_method || null, reference_no || null, actor.adminId]
    );

    await pool.query(
      `INSERT INTO financial_ledger (transaction_type, amount, admin_id, date, description, reference_id, payment_method)
       VALUES ('Debit', $1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6)`,
      [
        amount,
        actor.adminId,
        expense_date || null,
        `Office Expense - ${category}: ${description}`,
        `EXP-${insertResult.rows[0].id}`,
        payment_method || 'Office Expense',
      ]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to create office expense' });
  }
});

// PUT /api/expenses/:id
router.put('/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureExpenseSchema();

    const {
      expense_date,
      category,
      amount,
      description,
      vendor,
      payment_method,
      reference_no,
    } = req.body as Record<string, string | number>;

    const actor = req.admin!;
    const result = await pool.query(
      `UPDATE office_expenses
       SET expense_date = COALESCE($1::date, expense_date),
           category = COALESCE($2, category),
           amount = COALESCE($3::numeric, amount),
           description = COALESCE($4, description),
           vendor = $5,
           payment_method = $6,
           reference_no = $7,
           updated_by = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        expense_date || null,
        category || null,
        amount || null,
        description || null,
        vendor || null,
        payment_method || null,
        reference_no || null,
        actor.adminId,
        req.params.id,
      ]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to update office expense' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureExpenseSchema();
    const result = await pool.query('DELETE FROM office_expenses WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.json({ message: 'Office expense deleted' });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to delete office expense' });
  }
});

export default router;