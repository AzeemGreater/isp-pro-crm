import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const result = await pool.query(
      'SELECT id, username, hashed_password, full_name, role, permissions_json, wallet_balance, is_active FROM admins WHERE username = $1',
      [username.toLowerCase().trim()]
    );

    const admin = result.rows[0];
    if (!admin || !admin.is_active) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.hashed_password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'] }
    );

    logger.info(`Admin login: ${admin.username} (${admin.role})`);

    res.json({
      token,
      admin: {
        id:            admin.id,
        username:      admin.username,
        fullName:      admin.full_name,
        role:          admin.role,
        permissions:   admin.permissions_json,
        walletBalance: parseFloat(admin.wallet_balance),
      },
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// POST /api/auth/logout  (client-side token drop, but log it)
router.post('/logout', (req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { adminId, currentPassword, newPassword } = req.body as {
      adminId: string; currentPassword: string; newPassword: string;
    };

    const result = await pool.query(
      'SELECT hashed_password FROM admins WHERE id = $1', [adminId]
    );
    const admin = result.rows[0];
    if (!admin) { res.status(404).json({ error: 'Admin not found' }); return; }

    const valid = await bcrypt.compare(currentPassword, admin.hashed_password);
    if (!valid) { res.status(400).json({ error: 'Current password incorrect' }); return; }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE admins SET hashed_password = $1 WHERE id = $2', [hashed, adminId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
