import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authMiddleware);

async function ensureAdminAccountSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS customer_limit INTEGER
  `);
}

async function ensureSettingsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS role_branding_settings (
      role admin_role PRIMARY KEY,
      app_name VARCHAR(120) NOT NULL DEFAULT 'ISP CRM Pro',
      app_tagline VARCHAR(180) NOT NULL DEFAULT 'Network Command Center',
      logo_text VARCHAR(24) NOT NULL DEFAULT 'ISP',
      primary_color VARCHAR(16) NOT NULL DEFAULT '#4285F4',
      accent_color VARCHAR(16) NOT NULL DEFAULT '#34A853',
      updated_by UUID REFERENCES admins(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    INSERT INTO role_branding_settings (role)
    VALUES ('SuperAdmin'), ('Admin'), ('Agent'), ('Viewer')
    ON CONFLICT (role) DO NOTHING
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_system_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      mikrotik_default_port INTEGER NOT NULL DEFAULT 8729,
      mikrotik_use_tls BOOLEAN NOT NULL DEFAULT true,
      whatsapp_safe_mode_min INTEGER NOT NULL DEFAULT 10,
      whatsapp_safe_mode_max INTEGER NOT NULL DEFAULT 20,
      jwt_expires VARCHAR(24) NOT NULL DEFAULT '8h',
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Karachi',
      updated_by UUID REFERENCES admins(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `
    INSERT INTO app_system_settings (
      id,
      mikrotik_default_port,
      mikrotik_use_tls,
      whatsapp_safe_mode_min,
      whatsapp_safe_mode_max,
      jwt_expires,
      timezone
    )
    VALUES (1, $1, $2, 10, 20, $3, 'Asia/Karachi')
    ON CONFLICT (id) DO NOTHING
    `,
    [
      parseInt(process.env.MIKROTIK_API_PORT || '8729', 10),
      process.env.MIKROTIK_USE_TLS !== 'false',
      process.env.JWT_EXPIRES_IN || '8h',
    ]
  );
}

function normalizeRoleInput(role?: string): string {
  if (!role) return 'Agent';
  if (role === 'Subdealer') return 'Agent';
  return role;
}

// GET /api/agents — list all agents
router.get('/', requireRole('SuperAdmin', 'Admin'), async (_req, res) => {
  try {
    await ensureAdminAccountSchema();
    const result = await pool.query(
      `SELECT a.id, a.username, a.email, a.full_name, a.role,
              CASE WHEN role='Agent' THEN 'Subdealer' ELSE role::TEXT END AS role_label,
              a.permissions_json, a.wallet_balance, a.customer_limit, a.is_active, a.created_at,
              COUNT(s.id)::INT AS customers_used,
              CASE
                WHEN a.customer_limit IS NULL THEN NULL
                ELSE GREATEST(a.customer_limit - COUNT(s.id)::INT, 0)
              END AS customers_remaining
       FROM admins a
       LEFT JOIN subscribers s ON s.agent_id = a.id
       GROUP BY a.id
       ORDER BY a.role, a.username`
    );
    res.json(result.rows);
  } catch (_err) { res.status(500).json({ error: 'Failed to fetch agents' }); }
});

// GET /api/agents/subdealers/overview — subdealers with quick subscriber statuses
router.get('/subdealers/overview', requireRole('SuperAdmin', 'Admin'), async (_req, res) => {
  try {
    await ensureAdminAccountSchema();
    const result = await pool.query(`
      SELECT
        a.id,
        a.username,
        a.full_name,
        a.email,
        a.wallet_balance,
        a.customer_limit,
        a.is_active,
        a.permissions_json,
        COUNT(s.id)::INT AS total_users,
        CASE
          WHEN a.customer_limit IS NULL THEN NULL
          ELSE GREATEST(a.customer_limit - COUNT(s.id)::INT, 0)
        END AS customers_remaining,
        COUNT(*) FILTER (WHERE s.status = 'Active')::INT AS online_users,
        COUNT(*) FILTER (WHERE s.status <> 'Active' AND s.id IS NOT NULL)::INT AS offline_users,
        COUNT(*) FILTER (WHERE s.status = 'Disabled')::INT AS disabled_users,
        COUNT(*) FILTER (WHERE s.status = 'Expired')::INT AS expired_users
      FROM admins a
      LEFT JOIN subscribers s ON s.agent_id = a.id
      WHERE a.role = 'Agent'
      GROUP BY a.id
      ORDER BY a.full_name ASC
    `);
    res.json(result.rows);
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch subdealer overview' });
  }
});

// POST /api/agents — create agent/admin
router.post('/', requireRole('SuperAdmin'), async (req: Request, res: Response) => {
  try {
    await ensureAdminAccountSchema();
    const {
      username,
      email,
      password,
      full_name,
      role = 'Agent',
      wallet_balance = 0,
      customer_limit = null,
      permissions_json = {},
    } = req.body as Record<string, unknown>;
    if (!username || !password || !full_name) {
      res.status(400).json({ error: 'username, password and full_name are required' }); return;
    }

    const normalizedCustomerLimit =
      customer_limit === null || customer_limit === undefined || customer_limit === ''
        ? null
        : Number(customer_limit);
    if (normalizedCustomerLimit !== null && (!Number.isFinite(normalizedCustomerLimit) || normalizedCustomerLimit < 0)) {
      res.status(400).json({ error: 'customer_limit must be a non-negative number or null' });
      return;
    }
    const hashed = await bcrypt.hash(String(password), 12);
    const normalizedRole = normalizeRoleInput(String(role));
    const result = await pool.query(
      `INSERT INTO admins (username, email, hashed_password, full_name, role, wallet_balance, customer_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, username, email, full_name, role, wallet_balance, customer_limit, permissions_json`,
      [
        String(username).toLowerCase(),
        email ? String(email) : null,
        hashed,
        String(full_name),
        normalizedRole,
        Number(wallet_balance || 0),
        normalizedCustomerLimit,
      ]
    );
    await pool.query('UPDATE admins SET permissions_json=$1 WHERE id=$2', [permissions_json, result.rows[0].id]);
    result.rows[0].permissions_json = permissions_json;
    result.rows[0].role_label = result.rows[0].role === 'Agent' ? 'Subdealer' : result.rows[0].role;
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ error: 'Username or email already exists' }); return;
    }
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PUT /api/agents/:id — update user/subdealer details
router.put('/:id([0-9a-fA-F-]{36})', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureAdminAccountSchema();
    const requester = req.admin;
    if (!requester) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      email, full_name, role, wallet_balance, customer_limit, is_active, permissions_json, password,
    } = req.body as Record<string, unknown>;

    const targetId = req.params.id;
    const targetRes = await pool.query('SELECT id, role FROM admins WHERE id=$1', [targetId]);
    if (!targetRes.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (requester.role !== 'SuperAdmin' && targetRes.rows[0].role === 'SuperAdmin') {
      res.status(403).json({ error: 'Only SuperAdmin can modify SuperAdmin accounts' });
      return;
    }

    const normalizedRole = role ? normalizeRoleInput(String(role)) : undefined;
    const normalizedCustomerLimit =
      customer_limit === undefined || customer_limit === '' || customer_limit === null
        ? null
        : Number(customer_limit);
    if (normalizedCustomerLimit !== null && (!Number.isFinite(normalizedCustomerLimit) || normalizedCustomerLimit < 0)) {
      res.status(400).json({ error: 'customer_limit must be a non-negative number or null' });
      return;
    }

    const result = await pool.query(
      `UPDATE admins
       SET email = COALESCE($1, email),
           full_name = COALESCE($2, full_name),
           role = COALESCE($3::admin_role, role),
           wallet_balance = COALESCE($4::numeric, wallet_balance),
           customer_limit = COALESCE($5::INTEGER, customer_limit),
           is_active = COALESCE($6::boolean, is_active),
           permissions_json = COALESCE($7::jsonb, permissions_json),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, username, email, full_name, role,
                 CASE WHEN role='Agent' THEN 'Subdealer' ELSE role::TEXT END AS role_label,
                 wallet_balance, customer_limit, permissions_json, is_active, created_at, updated_at`,
      [
        email === undefined ? null : String(email),
        full_name === undefined ? null : String(full_name),
        normalizedRole ?? null,
        wallet_balance === undefined ? null : Number(wallet_balance),
        normalizedCustomerLimit,
        is_active === undefined ? null : Boolean(is_active),
        permissions_json === undefined ? null : JSON.stringify(permissions_json),
        targetId,
      ]
    );

    if (password) {
      const hashed = await bcrypt.hash(String(password), 12);
      await pool.query('UPDATE admins SET hashed_password=$1, updated_at=NOW() WHERE id=$2', [hashed, targetId]);
    }

    res.json(result.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('invalid input value for enum admin_role')) {
      res.status(400).json({ error: 'Invalid role. Allowed: SuperAdmin, Admin, Subdealer, Viewer' });
      return;
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/agents/:id — delete user/subdealer
router.delete('/:id([0-9a-fA-F-]{36})', requireRole('SuperAdmin'), async (req: Request, res: Response) => {
  try {
    if (req.admin?.adminId === req.params.id) {
      res.status(400).json({ error: 'You cannot delete your own account' });
      return;
    }
    const result = await pool.query('DELETE FROM admins WHERE id=$1 RETURNING id, username, role', [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ message: 'User deleted', deleted: result.rows[0] });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /api/agents/:id/credit — credit agent wallet
router.post('/:id/credit', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { amount, description } = req.body as { amount: number; description?: string };
    if (!amount || amount <= 0) { res.status(400).json({ error: 'Amount must be positive' }); return; }
    const result = await pool.query(
      'UPDATE admins SET wallet_balance = wallet_balance + $1 WHERE id=$2 RETURNING wallet_balance',
      [amount, req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Agent not found' }); return; }

    await pool.query(
      `INSERT INTO financial_ledger (transaction_type, amount, admin_id, description, payment_method)
       VALUES ('Credit', $1, $2, $3, 'Manual Credit')`,
      [amount, req.params.id, description || 'Admin wallet credit']
    );
    res.json({ new_balance: result.rows[0].wallet_balance });
  } catch (_err) { res.status(500).json({ error: 'Failed to credit wallet' }); }
});

// POST /api/agents/:id/debit — deduct from wallet
router.post('/:id/debit', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { amount, description } = req.body as { amount: number; description?: string };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Amount must be positive' });
      return;
    }

    const result = await pool.query(
      `UPDATE admins
       SET wallet_balance = wallet_balance - $1
       WHERE id = $2 AND wallet_balance >= $1
       RETURNING wallet_balance`,
      [amount, req.params.id]
    );

    if (!result.rows[0]) {
      const exists = await pool.query('SELECT id FROM admins WHERE id = $1', [req.params.id]);
      if (!exists.rows[0]) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.status(400).json({ error: 'Insufficient wallet balance to deduct this amount' });
      return;
    }

    await pool.query(
      `INSERT INTO financial_ledger (transaction_type, amount, admin_id, description, payment_method)
       VALUES ('Debit', $1, $2, $3, 'Manual Debit')`,
      [amount, req.params.id, description || 'Admin wallet deduction']
    );

    res.json({ new_balance: result.rows[0].wallet_balance });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to debit wallet' });
  }
});

// POST /api/agents/bulk-credit — credit all subdealers in one action
router.post('/bulk-credit', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { amount, description, role = 'Agent' } = req.body as { amount: number; description?: string; role?: string };
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Amount must be positive' });
      return;
    }
    const normalizedRole = normalizeRoleInput(role);
    const creditRes = await pool.query(
      `UPDATE admins
       SET wallet_balance = wallet_balance + $1
       WHERE role = $2::admin_role AND is_active = true
       RETURNING id`,
      [amount, normalizedRole]
    );

    if (creditRes.rowCount === 0) {
      res.status(404).json({ error: 'No active users found for selected role' });
      return;
    }

    await pool.query(
      `INSERT INTO financial_ledger (transaction_type, amount, admin_id, description, payment_method)
       SELECT 'Credit', $1, a.id, $2, 'Bulk Credit'
       FROM admins a
       WHERE a.id = ANY($3::uuid[])`,
      [amount, description || `Bulk balance top-up for ${normalizedRole}`, creditRes.rows.map((r) => r.id)]
    );

    res.json({
      message: 'Bulk balance credit completed',
      affected_users: creditRes.rowCount,
      amount_per_user: amount,
      total_amount: Number(amount) * Number(creditRes.rowCount),
      role: normalizedRole === 'Agent' ? 'Subdealer' : normalizedRole,
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to process bulk credit' });
  }
});

// GET /api/agents/:id/wallet — agent wallet info
router.get('/:id/wallet', async (req: Request, res: Response) => {
  try {
    await ensureAdminAccountSchema();
    const requester = req.admin;
    if (!requester) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const isPrivileged = requester.role === 'SuperAdmin' || requester.role === 'Admin';
    if (!isPrivileged && requester.adminId !== req.params.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const result = await pool.query(
      `SELECT
         a.wallet_balance,
         a.username,
         a.customer_limit,
         (SELECT COUNT(*) FROM financial_ledger fl WHERE fl.admin_id = a.id) AS total_transactions,
         COALESCE((SELECT SUM(fl.amount) FROM financial_ledger fl WHERE fl.admin_id = a.id AND fl.transaction_type='Debit'), 0) AS total_debits,
         COALESCE((SELECT SUM(fl.amount) FROM financial_ledger fl WHERE fl.admin_id = a.id AND fl.transaction_type='Credit'), 0) AS total_credits,
         (SELECT COUNT(*)::INT FROM subscribers s WHERE s.agent_id = a.id) AS customers_used,
         CASE
           WHEN a.customer_limit IS NULL THEN NULL
           ELSE GREATEST(a.customer_limit - (SELECT COUNT(*)::INT FROM subscribers s WHERE s.agent_id = a.id), 0)
         END AS customers_remaining
       FROM admins a
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(result.rows[0]);
  } catch (_err) { res.status(500).json({ error: 'Failed to fetch wallet' }); }
});

// GET /api/agents/settings — system settings (configurable ports etc)
router.get('/settings', requireRole('SuperAdmin', 'Admin', 'Agent'), async (_req, res) => {
  try {
    await ensureSettingsSchema();
    const [brandingRes, systemRes] = await Promise.all([
      pool.query(
      `SELECT role, app_name, app_tagline, logo_text, primary_color, accent_color, updated_at
       FROM role_branding_settings
       ORDER BY role`
      ),
      pool.query(
        `SELECT mikrotik_default_port, mikrotik_use_tls, whatsapp_safe_mode_min,
                whatsapp_safe_mode_max, jwt_expires, timezone
         FROM app_system_settings
         WHERE id = 1`
      ),
    ]);

    const system = systemRes.rows[0] || {
      mikrotik_default_port: parseInt(process.env.MIKROTIK_API_PORT || '8729', 10),
      mikrotik_use_tls: process.env.MIKROTIK_USE_TLS !== 'false',
      whatsapp_safe_mode_min: 10,
      whatsapp_safe_mode_max: 20,
      jwt_expires: process.env.JWT_EXPIRES_IN || '8h',
      timezone: 'Asia/Karachi',
    };

    res.json({
      mikrotik: {
        default_port: Number(system.mikrotik_default_port || 8729),
        use_tls: Boolean(system.mikrotik_use_tls),
        available_ports: [8728, 8729],
      },
      radius: {
        auth_port: 1812,
        acct_port: 1813,
      },
      whatsapp: {
        provider: 'baileys',
        safe_mode_default_min: Number(system.whatsapp_safe_mode_min || 10),
        safe_mode_default_max: Number(system.whatsapp_safe_mode_max || 20),
      },
      system: {
        jwt_expires: String(system.jwt_expires || '8h'),
        timezone: String(system.timezone || 'Asia/Karachi'),
      },
      branding: brandingRes.rows.map((r) => ({
        ...r,
        role_label: r.role === 'Agent' ? 'Subdealer' : r.role,
      })),
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/agents/settings — save system settings
router.put('/settings', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const requester = req.admin;
    if (!requester) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      mikrotik,
      whatsapp,
      system,
    } = req.body as {
      mikrotik?: { default_port?: number; use_tls?: boolean }
      whatsapp?: { safe_mode_default_min?: number; safe_mode_default_max?: number }
      system?: { jwt_expires?: string; timezone?: string }
    };

    const defaultPort = Number(mikrotik?.default_port ?? 8729);
    const useTls = Boolean(mikrotik?.use_tls ?? true);
    const safeMin = Number(whatsapp?.safe_mode_default_min ?? 10);
    const safeMax = Number(whatsapp?.safe_mode_default_max ?? 20);
    const jwtExpires = String(system?.jwt_expires ?? '8h').trim() || '8h';
    const timezone = String(system?.timezone ?? 'Asia/Karachi').trim() || 'Asia/Karachi';

    if (![8728, 8729].includes(defaultPort)) {
      res.status(400).json({ error: 'Invalid MikroTik port. Allowed: 8728 or 8729' });
      return;
    }
    if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax) || safeMin < 1 || safeMax < safeMin) {
      res.status(400).json({ error: 'Invalid WhatsApp safe mode delay range' });
      return;
    }

    await ensureSettingsSchema();
    const result = await pool.query(
      `
      UPDATE app_system_settings
      SET mikrotik_default_port = $1,
          mikrotik_use_tls = $2,
          whatsapp_safe_mode_min = $3,
          whatsapp_safe_mode_max = $4,
          jwt_expires = $5,
          timezone = $6,
          updated_by = $7,
          updated_at = NOW()
      WHERE id = 1
      RETURNING mikrotik_default_port, mikrotik_use_tls, whatsapp_safe_mode_min,
                whatsapp_safe_mode_max, jwt_expires, timezone, updated_at
      `,
      [defaultPort, useTls, safeMin, safeMax, jwtExpires, timezone, requester.adminId]
    );

    res.json({
      message: 'System settings updated',
      settings: result.rows[0],
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// GET /api/agents/settings/branding/current — branding for currently logged-in role
router.get('/settings/branding/current', async (req: Request, res: Response) => {
  try {
    const requester = req.admin;
    if (!requester) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureSettingsSchema();
    const result = await pool.query(
      `SELECT role, app_name, app_tagline, logo_text, primary_color, accent_color, updated_at
       FROM role_branding_settings
       WHERE role=$1::admin_role`,
      [requester.role]
    );
    res.json({
      ...result.rows[0],
      role_label: requester.role === 'Agent' ? 'Subdealer' : requester.role,
    });
  } catch (_err) {
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

// PUT /api/agents/settings/branding/:role — update role branding
router.put('/settings/branding/:role', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    const requester = req.admin;
    if (!requester) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const requestedRole = normalizeRoleInput(req.params.role);
    const actorRole = normalizeRoleInput(requester.role);
    const isPrivileged = requester.role === 'SuperAdmin' || requester.role === 'Admin';

    if (!isPrivileged && requestedRole !== actorRole) {
      res.status(403).json({ error: 'You can only update your own role branding' });
      return;
    }

    const { app_name, app_tagline, logo_text, primary_color, accent_color } = req.body as Record<string, string>;
    await ensureSettingsSchema();

    const result = await pool.query(
      `UPDATE role_branding_settings
       SET app_name = COALESCE($1, app_name),
           app_tagline = COALESCE($2, app_tagline),
           logo_text = COALESCE($3, logo_text),
           primary_color = COALESCE($4, primary_color),
           accent_color = COALESCE($5, accent_color),
           updated_by = $6,
           updated_at = NOW()
       WHERE role = $7::admin_role
       RETURNING role, app_name, app_tagline, logo_text, primary_color, accent_color, updated_at`,
      [app_name || null, app_tagline || null, logo_text || null, primary_color || null, accent_color || null, requester.adminId, requestedRole]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Role branding not found' });
      return;
    }

    res.json({ ...result.rows[0], role_label: result.rows[0].role === 'Agent' ? 'Subdealer' : result.rows[0].role });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('invalid input value for enum admin_role')) {
      res.status(400).json({ error: 'Invalid role. Use SuperAdmin, Admin, Subdealer, Viewer' });
      return;
    }
    res.status(500).json({ error: 'Failed to update branding' });
  }
});

export default router;
