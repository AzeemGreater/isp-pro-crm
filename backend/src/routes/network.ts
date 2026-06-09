import { Router, Request, Response } from 'express';
import { pool } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';
import { encrypt } from '../crypto/aes';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);

async function ensureNasSchema(): Promise<void> {
  await pool.query("ALTER TABLE nas_routers ADD COLUMN IF NOT EXISTS routeros_version VARCHAR(32) NOT NULL DEFAULT 'RouterOS v7'");
  await pool.query('ALTER TABLE nas_routers ADD COLUMN IF NOT EXISTS coa_port INTEGER NOT NULL DEFAULT 3799');
}

// ─── ZONES ──────────────────────────────────────────────────────────────────
router.get('/zones', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM isp_zones WHERE is_active=true ORDER BY zone_code');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch zones' }); }
});

router.post('/zones', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    const { zone_code, area_name, city, description } = req.body as Record<string, string>;
    const result = await pool.query(
      'INSERT INTO isp_zones (zone_code, area_name, city, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [zone_code.toUpperCase(), area_name, city, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ error: 'Zone code already exists' }); return;
    }
    res.status(500).json({ error: 'Failed to create zone' });
  }
});

router.put('/zones/:id', requireRole('SuperAdmin', 'Admin', 'Agent'), async (req: Request, res: Response) => {
  try {
    const { area_name, city, description, is_active } = req.body as Record<string, string>;
    const result = await pool.query(
      'UPDATE isp_zones SET area_name=$1, city=$2, description=$3, is_active=$4 WHERE id=$5 RETURNING *',
      [area_name, city, description, is_active, req.params.id]
    );
    if (!result.rows[0]) { res.status(404).json({ error: 'Zone not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update zone' }); }
});

// ─── PROFILES ────────────────────────────────────────────────────────────────
router.get('/profiles', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, COUNT(s.id)::INT AS subscriber_count
      FROM internet_profiles p
      LEFT JOIN subscribers s ON s.profile_id = p.id
      WHERE p.is_active = true
      GROUP BY p.id
      ORDER BY p.retail_price
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch profiles' }); }
});

router.post('/profiles', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { name, download_speed, upload_speed, retail_price, wholesale_cost, validity_days, pppoe_pool, description } = req.body as Record<string, string>;
    const result = await pool.query(`
      INSERT INTO internet_profiles (name, download_speed, upload_speed, retail_price, wholesale_cost, validity_days, pppoe_pool, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [name, download_speed, upload_speed, retail_price, wholesale_cost || 0, validity_days || 30, pppoe_pool || null, description || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create profile' }); }
});

router.put('/profiles/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { name, download_speed, upload_speed, retail_price, wholesale_cost, validity_days, pppoe_pool, is_active } = req.body as Record<string, string>;
    const result = await pool.query(`
      UPDATE internet_profiles SET name=$1, download_speed=$2, upload_speed=$3,
        retail_price=$4, wholesale_cost=$5, validity_days=$6, pppoe_pool=$7, is_active=$8
      WHERE id=$9 RETURNING *
    `, [name, download_speed, upload_speed, retail_price, wholesale_cost, validity_days, pppoe_pool, is_active, req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update profile' }); }
});

router.delete('/profiles/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM internet_profiles WHERE id=$1 RETURNING id, name', [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ message: 'Plan deleted', deleted: result.rows[0] });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('violates foreign key constraint')) {
      res.status(409).json({ error: 'Cannot delete plan because subscribers are using it' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// ─── NAS ROUTERS ─────────────────────────────────────────────────────────────
router.get('/nas', async (_req, res) => {
  try {
    await ensureNasSchema();
    const result = await pool.query(
      'SELECT id, name, ip_address, routeros_version, api_port, coa_port, api_user, nas_secret, location, zone_id, is_active, last_seen FROM nas_routers ORDER BY name'
    );
    res.json(result.rows); // NOTE: encrypted_api_pass is intentionally excluded
  } catch (err) { res.status(500).json({ error: 'Failed to fetch NAS routers' }); }
});

router.post('/nas', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureNasSchema();
    const {
      name,
      ip_address,
      routeros_version,
      api_port,
      coa_port,
      api_user,
      api_password,
      nas_secret,
      location,
      zone_id,
    } = req.body as Record<string, string>;
    const encrypted = encrypt(api_password);
    const result = await pool.query(`
      INSERT INTO nas_routers (name, ip_address, routeros_version, api_port, coa_port, api_user, encrypted_api_pass, nas_secret, location, zone_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, name, ip_address, routeros_version, api_port, coa_port, api_user, location, zone_id
    `, [
      name,
      ip_address,
      routeros_version || 'RouterOS v7',
      api_port || 8728,
      coa_port || 3799,
      api_user,
      encrypted,
      nas_secret,
      location || null,
      zone_id || null,
    ]);

    // Also register in FreeRADIUS nas table
    await pool.query(
      'INSERT INTO nas (nasname, shortname, type, secret, description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [ip_address, name.substring(0, 32), 'other', nas_secret, name]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to create NAS router' }); }
});

router.put('/nas/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    await ensureNasSchema();
    const {
      name,
      ip_address,
      routeros_version,
      api_port,
      coa_port,
      api_user,
      api_password,
      nas_secret,
      location,
      zone_id,
      is_active,
    } = req.body as Record<string, string>;
    let query = 'UPDATE nas_routers SET name=$1, ip_address=$2, api_port=$3, api_user=$4, nas_secret=COALESCE($5, nas_secret), location=$6, zone_id=$7, is_active=$8, routeros_version=COALESCE($9, routeros_version), coa_port=COALESCE($10, coa_port)';
    const params: unknown[] = [
      name,
      ip_address,
      api_port,
      api_user,
      nas_secret || null,
      location,
      zone_id,
      is_active,
      routeros_version || null,
      coa_port || null,
    ];

    if (api_password) {
      query += ', encrypted_api_pass=$11 WHERE id=$12 RETURNING id, name, ip_address, routeros_version, api_port, coa_port';
      params.push(encrypt(api_password), req.params.id);
    } else {
      query += ' WHERE id=$11 RETURNING id, name, ip_address, routeros_version, api_port, coa_port';
      params.push(req.params.id);
    }

    const result = await pool.query(query, params);
    if (!result.rows[0]) { res.status(404).json({ error: 'NAS router not found' }); return; }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Failed to update NAS router' }); }
});

router.delete('/nas/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM nas_routers WHERE id=$1 RETURNING id, name, ip_address', [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'NAS router not found' });
      return;
    }

    await pool.query('DELETE FROM nas WHERE nasname = $1', [result.rows[0].ip_address]);
    res.json({ message: 'NAS router deleted', deleted: result.rows[0] });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('violates foreign key constraint')) {
      res.status(409).json({ error: 'Cannot delete NAS router because subscribers are assigned to it' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete NAS router' });
  }
});

// ─── OLT DEVICES ─────────────────────────────────────────────────────────────
router.get('/olt', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, ip_address, ssh_port, ssh_user, olt_type, snmp_community, location, zone_id, is_active FROM olt_devices ORDER BY name'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch OLT devices' }); }
});

router.post('/olt', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { name, ip_address, ssh_port, ssh_user, ssh_password, olt_type, snmp_community, location, zone_id } = req.body as Record<string, string>;
    const result = await pool.query(`
      INSERT INTO olt_devices (name, ip_address, ssh_port, ssh_user, encrypted_pass, olt_type, snmp_community, location, zone_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, ip_address, ssh_port, olt_type
    `, [name, ip_address, ssh_port || 22, ssh_user, encrypt(ssh_password), olt_type || 'VSOL', snmp_community || 'public', location || null, zone_id || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Create OLT error:', err);
    res.status(500).json({ error: 'Failed to create OLT device' });
  }
});

router.put('/olt/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { name, ip_address, ssh_port, ssh_user, ssh_password, olt_type, snmp_community, location, zone_id, is_active } = req.body as Record<string, string>;
    let query = `
      UPDATE olt_devices
      SET name=$1, ip_address=$2, ssh_port=$3, ssh_user=$4,
          olt_type=$5, snmp_community=$6, location=$7, zone_id=$8, is_active=$9
    `;
    const params: unknown[] = [name, ip_address, ssh_port || 22, ssh_user, olt_type || 'VSOL', snmp_community || 'public', location || null, zone_id || null, is_active];

    if (ssh_password) {
      query += ', encrypted_pass=$10 WHERE id=$11 RETURNING id, name, ip_address, ssh_port, ssh_user, olt_type, location, zone_id, is_active';
      params.push(encrypt(ssh_password), req.params.id);
    } else {
      query += ' WHERE id=$10 RETURNING id, name, ip_address, ssh_port, ssh_user, olt_type, location, zone_id, is_active';
      params.push(req.params.id);
    }

    const result = await pool.query(query, params);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'OLT device not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Update OLT error:', err);
    res.status(500).json({ error: 'Failed to update OLT device' });
  }
});

router.delete('/olt/:id', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM olt_devices WHERE id=$1 RETURNING id, name', [req.params.id]);
    if (!result.rows[0]) {
      res.status(404).json({ error: 'OLT device not found' });
      return;
    }
    res.json({ message: 'OLT device deleted', deleted: result.rows[0] });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('violates foreign key constraint')) {
      res.status(409).json({ error: 'Cannot delete OLT because subscribers are assigned to it' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete OLT device' });
  }
});

export default router;
