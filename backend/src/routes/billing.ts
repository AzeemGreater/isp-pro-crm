import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole, isAgentRequest, getActorAdminId } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);

function buildInvoiceNumber(prefix: string = 'INV'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

// GET /api/billing/ledger — paginated transaction list
router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const page   = Math.max(1, parseInt(req.query.page as string || '1'));
    const limit  = Math.min(100, parseInt(req.query.limit as string || '25'));
    const offset = (page - 1) * limit;
    const type   = req.query.type as string;

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let pIdx = 1;
    if (type) { where += ` AND fl.transaction_type = $${pIdx}`; params.push(type); pIdx++; }
    if (actorAgentId) {
      where += ` AND (fl.admin_id = $${pIdx} OR s.agent_id = $${pIdx})`;
      params.push(actorAgentId);
      pIdx++;
    }

    const [data, count, summary] = await Promise.all([
      pool.query(`
        SELECT fl.*, s.full_name, s.pppoe_username,
               a.username AS admin_username,
               p.name AS profile_name, p.retail_price, p.wholesale_cost
        FROM financial_ledger fl
        LEFT JOIN subscribers s       ON fl.subscriber_id = s.id
        LEFT JOIN admins a            ON fl.admin_id      = a.id
        LEFT JOIN internet_profiles p ON fl.profile_id    = p.id
        ${where}
        ORDER BY fl.created_at DESC
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `, [...params, limit, offset]),
      pool.query(`
        SELECT COUNT(*)
        FROM financial_ledger fl
        LEFT JOIN subscribers s ON fl.subscriber_id = s.id
        ${where}
      `, params),
      pool.query(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'Credit'), 0) AS total_credits,
          COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'Debit'),  0) AS total_debits,
          COALESCE(SUM(CASE WHEN transaction_type = 'Credit' THEN amount
                            WHEN transaction_type = 'Debit' THEN -amount ELSE 0 END), 0) AS net_balance,
          COALESCE(SUM(p.wholesale_cost), 0) AS total_wholesale_cost
        FROM financial_ledger fl
        LEFT JOIN internet_profiles p ON fl.profile_id = p.id
        LEFT JOIN subscribers s ON fl.subscriber_id = s.id
        ${where}
      `, params),
    ]);

    res.json({
      data:       data.rows,
      summary:    summary.rows[0],
      pagination: { page, limit, total: parseInt(count.rows[0].count) },
    });
  } catch (err) {
    logger.error('GET /billing/ledger error:', err);
    res.status(500).json({ error: 'Failed to fetch ledger' });
  }
});

// GET /api/billing/revenue — daily revenue for charts
router.get('/revenue', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const days = parseInt(req.query.days as string || '30');
    const params: unknown[] = [days];
    let where = `WHERE date >= CURRENT_DATE - ($1 || ' days')::INTERVAL`;

    if (actorAgentId) {
      where += ` AND (financial_ledger.admin_id = $2 OR s.agent_id = $2)`;
      params.push(actorAgentId);
    }

    const result = await pool.query(`
      SELECT
        date::TEXT,
        SUM(amount) FILTER (WHERE transaction_type = 'Credit') AS revenue,
        COUNT(*) FILTER (WHERE transaction_type = 'Credit')    AS transactions
      FROM financial_ledger
      LEFT JOIN subscribers s ON financial_ledger.subscriber_id = s.id
      ${where}
      GROUP BY date
      ORDER BY date ASC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

// GET /api/billing/wasooli/generate/overview
router.get('/wasooli/generate/overview', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const search = (req.query.search as string || '').trim();
    const onlyPending = (req.query.only_pending as string || 'false') === 'true';

    const params: unknown[] = [];
    let p = 1;
    let where = "WHERE s.status IN ('Active', 'Expired')";

    if (search) {
      where += ` AND (s.full_name ILIKE $${p} OR s.pppoe_username ILIKE $${p} OR s.mobile ILIKE $${p} OR z.area_name ILIKE $${p})`;
      params.push(`%${search}%`);
      p++;
    }

    if (onlyPending) {
      where += ` AND NOT EXISTS (
        SELECT 1 FROM financial_ledger fl
        WHERE fl.subscriber_id = s.id
          AND fl.transaction_type = 'Debit'
          AND fl.date >= date_trunc('month', CURRENT_DATE)
          AND fl.date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
      )`;
    }

    if (actorAgentId) {
      where += ` AND s.agent_id = $${p}`;
      params.push(actorAgentId);
      p++;
    }

    const statsParams: unknown[] = [];
    let statsWhere = '';
    if (actorAgentId) {
      statsWhere = 'WHERE s.agent_id = $1';
      statsParams.push(actorAgentId);
    }

    const [statsRes, rowsRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INT AS total_customers,
          COUNT(*) FILTER (WHERE s.status = 'Active')::INT AS active_customers,
          COUNT(*) FILTER (WHERE s.status = 'Expired')::INT AS expired_customers,
          COALESCE(SUM(p.retail_price), 0)::NUMERIC AS projected_collection
        FROM subscribers s
        JOIN internet_profiles p ON p.id = s.profile_id
        ${statsWhere}
      `, statsParams),
      pool.query(`
        SELECT
          s.id,
          s.full_name,
          s.mobile,
          s.pppoe_username,
          s.status,
          s.expiration_date,
          (s.expiration_date - CURRENT_DATE)::INT AS days_remaining,
          z.area_name AS zone_name,
          p.name AS profile_name,
          p.retail_price,
          EXISTS (
            SELECT 1 FROM financial_ledger fl
            WHERE fl.subscriber_id = s.id
              AND fl.transaction_type = 'Debit'
              AND fl.date >= date_trunc('month', CURRENT_DATE)
              AND fl.date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
          ) AS billed_this_month
        FROM subscribers s
        LEFT JOIN isp_zones z ON z.id = s.zone_id
        JOIN internet_profiles p ON p.id = s.profile_id
        ${where}
        ORDER BY s.id DESC
        LIMIT 500
      `, params),
    ]);

    const stats = statsRes.rows[0];
    const customers = rowsRes.rows;
    const pending = customers.filter((c) => !c.billed_this_month).length;

    res.json({
      stats: {
        total_customers: stats.total_customers,
        active_customers: stats.active_customers,
        expired_customers: stats.expired_customers,
        pending_customers: pending,
        projected_collection: parseFloat(stats.projected_collection || 0),
      },
      data: customers,
    });
  } catch (err) {
    logger.error('GET /billing/wasooli/generate/overview error:', err);
    res.status(500).json({ error: 'Failed to load bill generation overview' });
  }
});

// POST /api/billing/wasooli/generate/selected
router.post('/wasooli/generate/selected', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const subscriberIds = (req.body?.subscriber_ids || []) as number[];
    if (!Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      res.status(400).json({ error: 'subscriber_ids is required' });
      return;
    }

    const uniqueIds = [...new Set(subscriberIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (uniqueIds.length === 0) {
      res.status(400).json({ error: 'No valid subscriber ids provided' });
      return;
    }

    const subscribersRes = await pool.query(`
      SELECT s.id, s.profile_id, p.retail_price, p.name AS profile_name
      FROM subscribers s
      JOIN internet_profiles p ON p.id = s.profile_id
      WHERE s.id = ANY($1::BIGINT[])
    `, [uniqueIds]);

    const subscribers = subscribersRes.rows;
    if (subscribers.length === 0) {
      res.status(404).json({ error: 'No subscribers found for selected ids' });
      return;
    }

    let generated = 0;
    const skipped: number[] = [];

    for (const sub of subscribers) {
      const alreadyBilled = await pool.query(`
        SELECT 1
        FROM financial_ledger
        WHERE subscriber_id = $1
          AND transaction_type = 'Debit'
          AND date >= date_trunc('month', CURRENT_DATE)
          AND date <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        LIMIT 1
      `, [sub.id]);

      if ((alreadyBilled.rowCount || 0) > 0) {
        skipped.push(sub.id);
        continue;
      }

      await pool.query(`
        INSERT INTO financial_ledger
          (transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method)
        VALUES
          ('Debit', $1, $2, $3, $4, $5, $6, 'Monthly Bill')
      `, [
        sub.retail_price,
        sub.id,
        req.admin!.adminId,
        sub.profile_id,
        buildInvoiceNumber('BILL'),
        `Monthly bill generated - ${sub.profile_name}`,
      ]);
      generated++;
    }

    res.json({
      message: 'Bill generation completed',
      generated,
      skipped_count: skipped.length,
      skipped_subscriber_ids: skipped,
    });
  } catch (err) {
    logger.error('POST /billing/wasooli/generate/selected error:', err);
    res.status(500).json({ error: 'Failed to generate bills for selected users' });
  }
});

// GET /api/billing/pos/queue
router.get('/pos/queue', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const search = (req.query.search as string || '').trim();
    const params: unknown[] = [];
    let where = "WHERE s.status IN ('Active', 'Expired')";
    let p = 1;

    if (search) {
      where += ` AND (s.full_name ILIKE $${p} OR s.pppoe_username ILIKE $${p} OR z.area_name ILIKE $${p} OR s.mobile ILIKE $${p})`;
      params.push(`%${search}%`);
      p++;
    }

    if (actorAgentId) {
      where += ` AND s.agent_id = $${p}`;
      params.push(actorAgentId);
    }

    const result = await pool.query(`
      SELECT
        s.id,
        s.full_name,
        s.pppoe_username,
        s.mobile,
        s.status,
        s.expiration_date,
        (s.expiration_date - CURRENT_DATE)::INT AS days_remaining,
        z.area_name,
        p.name AS profile_name,
        p.retail_price
      FROM subscribers s
      LEFT JOIN isp_zones z ON z.id = s.zone_id
      JOIN internet_profiles p ON p.id = s.profile_id
      ${where}
      ORDER BY s.expiration_date ASC, s.id DESC
      LIMIT 300
    `, params);

    res.json({ data: result.rows });
  } catch (err) {
    logger.error('GET /billing/pos/queue error:', err);
    res.status(500).json({ error: 'Failed to load POS queue' });
  }
});

// POST /api/billing/pos/collect
router.post('/pos/collect', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    const subscriberId = Number(req.body?.subscriber_id);
    if (!Number.isFinite(subscriberId)) {
      res.status(400).json({ error: 'subscriber_id is required' });
      return;
    }

    const subRes = await pool.query('SELECT id FROM subscribers WHERE id = $1', [subscriberId]);
    if (!subRes.rows[0]) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    const actor = req.admin!;
    const renewResponse = await pool.query(`
      SELECT s.id
      FROM subscribers s
      WHERE s.id = $1
      LIMIT 1
    `, [subscriberId]);

    if (!renewResponse.rows[0]) {
      res.status(404).json({ error: 'Subscriber not found' });
      return;
    }

    // Reuse the existing renewal business logic by calling SQL updates directly in the same way.
    const subDetailRes = await pool.query(
      'SELECT s.status, s.expiration_date, s.profile_id, p.retail_price, p.validity_days, p.name AS profile_name FROM subscribers s JOIN internet_profiles p ON p.id = s.profile_id WHERE s.id = $1',
      [subscriberId]
    );

    const s = subDetailRes.rows[0];
    const baseDateSql = s.status === 'Expired' ? 'CURRENT_DATE' : 'expiration_date';

    if (actor.role === 'Agent') {
      const wallet = await pool.query('SELECT wallet_balance FROM admins WHERE id = $1', [actor.adminId]);
      const currentBalance = parseFloat(wallet.rows[0]?.wallet_balance || 0);
      if (currentBalance < parseFloat(s.retail_price)) {
        res.status(402).json({ error: 'Insufficient wallet balance for renewal' });
        return;
      }
      await pool.query('UPDATE admins SET wallet_balance = wallet_balance - $1 WHERE id = $2', [s.retail_price, actor.adminId]);
    }

    const updated = await pool.query(`
      UPDATE subscribers
      SET expiration_date = ${baseDateSql} + ($1 || ' days')::INTERVAL,
          status = 'Active'
      WHERE id = $2
      RETURNING id, full_name, pppoe_username, status, expiration_date
    `, [s.validity_days, subscriberId]);

    await pool.query(`
      INSERT INTO financial_ledger
        (transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method)
      VALUES
        ('Debit', $1, $2, $3, $4, $5, $6, 'Agent POS')
    `, [
      s.retail_price,
      subscriberId,
      actor.adminId,
      s.profile_id,
      buildInvoiceNumber('POS'),
      `Monthly renewal - ${s.profile_name}`,
    ]);

    res.json({ message: 'Payment collected and renewal completed', subscriber: updated.rows[0] });
  } catch (err) {
    logger.error('POST /billing/pos/collect error:', err);
    res.status(500).json({ error: 'Failed to complete POS collection' });
  }
});

// GET /api/billing/invoices
router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const page = Math.max(1, parseInt((req.query.page as string) || '1'));
    const limit = Math.min(100, parseInt((req.query.limit as string) || '25'));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();
    const status = (req.query.status as string || '').trim();

    let where = 'WHERE fl.invoice_number IS NOT NULL';
    const params: unknown[] = [];
    let p = 1;

    if (search) {
      where += ` AND (fl.invoice_number ILIKE $${p} OR s.full_name ILIKE $${p} OR s.pppoe_username ILIKE $${p})`;
      params.push(`%${search}%`);
      p++;
    }

    if (status) {
      if (status === 'paid') {
        where += ` AND fl.transaction_type = 'Debit'`;
      } else if (status === 'credit') {
        where += ` AND fl.transaction_type = 'Credit'`;
      }
    }

    if (actorAgentId) {
      where += ` AND s.agent_id = $${p}`;
      params.push(actorAgentId);
      p++;
    }

    const [rows, count] = await Promise.all([
      pool.query(`
        SELECT
          fl.id,
          fl.invoice_number,
          fl.amount,
          fl.transaction_type,
          fl.date,
          fl.description,
          fl.payment_method,
          s.id AS subscriber_id,
          s.full_name,
          s.pppoe_username,
          a.username AS billed_by,
          p.name AS profile_name
        FROM financial_ledger fl
        LEFT JOIN subscribers s ON s.id = fl.subscriber_id
        LEFT JOIN admins a ON a.id = fl.admin_id
        LEFT JOIN internet_profiles p ON p.id = fl.profile_id
        ${where}
        ORDER BY fl.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM financial_ledger fl LEFT JOIN subscribers s ON s.id = fl.subscriber_id ${where}`, params),
    ]);

    const data = rows.rows.map((row) => ({
      ...row,
      status: row.transaction_type === 'Debit' ? 'Paid' : 'Credit',
    }));

    res.json({
      data,
      pagination: {
        page,
        limit,
        total: parseInt(count.rows[0].count),
      },
    });
  } catch (err) {
    logger.error('GET /billing/invoices error:', err);
    res.status(500).json({ error: 'Failed to load invoices' });
  }
});

// POST /api/billing/invoices
router.post('/invoices', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const {
      subscriber_id,
      amount,
      description,
      payment_method,
      transaction_type,
    } = req.body as {
      subscriber_id?: number;
      amount: number;
      description: string;
      payment_method?: string;
      transaction_type?: 'Debit' | 'Credit';
    };

    if (!amount || amount <= 0 || !description?.trim()) {
      res.status(400).json({ error: 'amount and description are required' });
      return;
    }

    let profileId: number | null = null;
    if (subscriber_id) {
      const sub = await pool.query('SELECT profile_id FROM subscribers WHERE id = $1', [subscriber_id]);
      if (!sub.rows[0]) {
        res.status(404).json({ error: 'Subscriber not found' });
        return;
      }
      profileId = sub.rows[0].profile_id;
    }

    const tType = transaction_type === 'Credit' ? 'Credit' : 'Debit';
    const invoiceNumber = buildInvoiceNumber('INV');

    const inserted = await pool.query(`
      INSERT INTO financial_ledger
        (transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, invoice_number, amount, transaction_type, date, description, payment_method
    `, [
      tType,
      amount,
      subscriber_id || null,
      req.admin!.adminId,
      profileId,
      invoiceNumber,
      description.trim(),
      payment_method || 'Cash',
    ]);

    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    logger.error('POST /billing/invoices error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// GET /api/billing/invoices/:id
router.get('/invoices/:invoiceNum', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const result = await pool.query(
      `
      SELECT fl.*, s.full_name, s.mobile, s.pppoe_username, p.name AS profile_name
      FROM financial_ledger fl
      LEFT JOIN subscribers s ON fl.subscriber_id=s.id
      LEFT JOIN internet_profiles p ON fl.profile_id=p.id
      WHERE fl.invoice_number = $1
        AND ($2::UUID IS NULL OR s.agent_id = $2)
      `,
      [req.params.invoiceNum, actorAgentId || null]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Invoice not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// GET /api/billing/expiring — subscribers expiring soon (for batch job)
router.get('/expiring', async (req: Request, res: Response) => {
  try {
    const actorAgentId = isAgentRequest(req) ? getActorAdminId(req) : '';
    const days = parseInt(req.query.days as string || '3');
    const result = await pool.query(`
      SELECT s.id, s.full_name, s.mobile, s.pppoe_username, s.expiration_date, s.status,
             p.name AS profile_name, p.retail_price,
             (s.expiration_date - CURRENT_DATE) AS days_remaining
      FROM subscribers s
      JOIN internet_profiles p ON s.profile_id = p.id
      WHERE s.status = 'Active'
        AND s.expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::INTERVAL
        AND ($2::UUID IS NULL OR s.agent_id = $2)
      ORDER BY s.expiration_date ASC
    `, [days, actorAgentId || null]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch expiring subscribers' });
  }
});

export default router;
