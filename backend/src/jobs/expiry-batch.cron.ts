import cron from 'node-cron';
import { pool } from '../db/pool';
import { logger } from '../utils/logger';

/**
 * Expiry Batch CRON — runs every hour
 * Marks subscribers as 'Expired' when their expiration_date has passed.
 * The DB trigger then auto-injects Auth-Type := Reject into radcheck.
 */
export function startExpiryBatchCron(): void {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await pool.query(`
        UPDATE subscribers
        SET status = 'Expired'
        WHERE status = 'Active'
          AND expiration_date < CURRENT_DATE
        RETURNING id, pppoe_username, expiration_date
      `);

      if (result.rowCount && result.rowCount > 0) {
        logger.info(`[CRON] Expired ${result.rowCount} subscribers: ${result.rows.map(r => r.pppoe_username).join(', ')}`);
      }
    } catch (err) {
      logger.error('[CRON] Expiry batch job failed:', err);
    }
  }, { timezone: 'Asia/Karachi' });

  logger.info('[CRON] Expiry batch scheduled: every hour at :00');
}
