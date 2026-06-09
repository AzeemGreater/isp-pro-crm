import { Router, Request, Response } from 'express';
import { pool, transaction } from '../db/pool';
import { authMiddleware, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

/** Generate a unique 16-character alphanumeric PIN (4x4 groups) */
function generatePIN(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusable chars (0,O,1,I)
  let pin = '';
  for (let i = 0; i < 16; i++) {
    pin += chars[crypto.randomInt(0, chars.length)];
  }
  return pin;
}

/** Generate formatted display PIN: XXXX-XXXX-XXXX-XXXX */
function formatPIN(pin: string): string {
  return `${pin.slice(0, 4)}-${pin.slice(4, 8)}-${pin.slice(8, 12)}-${pin.slice(12, 16)}`;
}

// POST /api/recharge/generate — batch generate PINs
router.post('/generate', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const { count = 10, face_value, expires_days = 180 } = req.body as {
      count?: number; face_value: number; expires_days?: number;
    };

    if (!face_value || face_value <= 0) {
      res.status(400).json({ error: 'face_value is required and must be > 0' }); return;
    }
    if (count > 500) {
      res.status(400).json({ error: 'Maximum 500 cards per batch' }); return;
    }

    const batchId = `BATCH-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const cards: { pin: string; face_value: number; batch_id: string }[] = [];

    // Generate unique PINs with collision check
    const generatedPins = new Set<string>();
    while (generatedPins.size < count) {
      generatedPins.add(generatePIN());
    }

    const values: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    for (const pin of generatedPins) {
      values.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},CURRENT_DATE + ($${pIdx+4} || ' days')::INTERVAL)`);
      params.push(pin, face_value, batchId, req.admin!.adminId, expires_days);
      pIdx += 5;
      cards.push({ pin, face_value, batch_id: batchId });
    }

    await pool.query(
      `INSERT INTO recharge_cards (pin, face_value, batch_id, generated_by, expires_at) VALUES ${values.join(',')}`,
      params
    );

    const formatted = cards.map(c => ({ ...c, display_pin: formatPIN(c.pin) }));
    logger.info(`Generated ${count} recharge cards batch=${batchId} by admin=${req.admin!.username}`);
    res.status(201).json({ batch_id: batchId, count: formatted.length, face_value, cards: formatted });
  } catch (err) {
    logger.error('Card generation error:', err);
    res.status(500).json({ error: 'Failed to generate cards' });
  }
});

// POST /api/recharge/redeem — redeem a PIN to wallet
router.post('/redeem', async (req: Request, res: Response) => {
  try {
    const { pin } = req.body as { pin: string };
    if (!pin) { res.status(400).json({ error: 'PIN is required' }); return; }

    // Normalize PIN (remove dashes, uppercase)
    const normalizedPin = pin.replace(/-/g, '').toUpperCase().trim();
    if (normalizedPin.length !== 16) {
      res.status(400).json({ error: 'Invalid PIN format. Must be 16 characters.' }); return;
    }

    const result = await transaction(async (client) => {
      // Lock the card row
      const cardRes = await client.query(
        'SELECT * FROM recharge_cards WHERE pin = $1 FOR UPDATE',
        [normalizedPin]
      );
      const card = cardRes.rows[0];

      if (!card)                    throw new Error('INVALID_PIN');
      if (card.status !== 'unused') throw new Error('ALREADY_USED');
      if (card.expires_at && new Date(card.expires_at) < new Date()) throw new Error('EXPIRED');

      // Mark card as redeemed
      await client.query(
        'UPDATE recharge_cards SET status=$1, redeemed_by=$2, redeemed_at=NOW() WHERE id=$3',
        ['redeemed', req.admin!.adminId, card.id]
      );

      // Credit admin wallet
      await client.query(
        'UPDATE admins SET wallet_balance = wallet_balance + $1 WHERE id = $2',
        [card.face_value, req.admin!.adminId]
      );

      // Log credit in ledger
      await client.query(
        `INSERT INTO financial_ledger (transaction_type, amount, admin_id, description, reference_id, payment_method)
         VALUES ('Credit', $1, $2, $3, $4, 'Recharge Card')`,
        [card.face_value, req.admin!.adminId, `Recharge card redemption - batch ${card.batch_id}`, card.batch_id]
      );

      // Get updated balance
      const balRes = await client.query('SELECT wallet_balance FROM admins WHERE id=$1', [req.admin!.adminId]);
      return { credited: card.face_value, new_balance: balRes.rows[0].wallet_balance, batch_id: card.batch_id };
    });

    res.json({ message: 'Card redeemed successfully', ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Redemption failed';
    if (['INVALID_PIN', 'ALREADY_USED', 'EXPIRED'].includes(msg)) {
      res.status(400).json({ error: msg === 'INVALID_PIN' ? 'Invalid PIN' : msg === 'ALREADY_USED' ? 'This card has already been redeemed' : 'Card has expired' });
      return;
    }
    res.status(500).json({ error: 'Redemption failed' });
  }
});

// GET /api/recharge/batches — list batches
router.get('/batches', requireRole('SuperAdmin', 'Admin'), async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT batch_id, face_value,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status='unused')   AS unused,
             COUNT(*) FILTER (WHERE status='redeemed') AS redeemed,
             MIN(rc.created_at) AS created_at,
             a.username AS generated_by
      FROM recharge_cards rc
      LEFT JOIN admins a ON rc.generated_by = a.id
      GROUP BY batch_id, face_value, a.username
      ORDER BY MIN(rc.created_at) DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch batches' }); }
});

// GET /api/recharge/batches/:batchId — cards in a batch
router.get('/batches/:batchId', requireRole('SuperAdmin', 'Admin'), async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, pin, face_value, status, redeemed_at, expires_at FROM recharge_cards WHERE batch_id=$1 ORDER BY id',
      [req.params.batchId]
    );
    const formatted = result.rows.map(r => ({ ...r, display_pin: formatPIN(r.pin) }));
    res.json(formatted);
  } catch (err) { res.status(500).json({ error: 'Failed to fetch batch cards' }); }
});

export default router;
