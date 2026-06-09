import cron from 'node-cron';
import { pool } from '../db/pool';
import { sendWhatsAppMessage, templates } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

/**
 * Expiry Reminder CRON — runs daily at 00:01 AM
 * Sends WhatsApp reminders to subscribers expiring in 3 days, 1 day, and today
 */
export function startExpiryReminderCron(): void {
  cron.schedule('1 0 * * *', async () => {
    logger.info('[CRON] Running expiry reminder job...');
    try {
      await sendExpiryReminders();
    } catch (err) {
      logger.error('[CRON] Expiry reminder job failed:', err);
    }
  }, { timezone: 'Asia/Karachi' });

  logger.info('[CRON] Expiry reminder scheduled: daily at 00:01 (PKT)');
}

async function sendExpiryReminders(): Promise<void> {
  const result = await pool.query(`
    SELECT
      s.id, s.full_name, s.mobile, s.pppoe_username,
      s.expiration_date::TEXT AS expiry,
      (s.expiration_date - CURRENT_DATE) AS days_remaining,
      p.retail_price::TEXT AS price, p.name AS plan_name
    FROM subscribers s
    JOIN internet_profiles p ON s.profile_id = p.id
    WHERE s.status = 'Active'
      AND s.mobile IS NOT NULL
      AND s.expiration_date IN (
        CURRENT_DATE + INTERVAL '3 days',
        CURRENT_DATE + INTERVAL '1 day',
        CURRENT_DATE
      )
    ORDER BY s.expiration_date ASC
  `);

  logger.info(`[CRON] Found ${result.rows.length} subscribers needing reminders`);

  for (const sub of result.rows) {
    const days = parseInt(sub.days_remaining);
    let message: string;
    let type: string;

    if (days === 3) {
      message = templates.expiry_3d(sub.full_name, sub.expiry, sub.price);
      type    = 'expiry_3d';
    } else if (days === 1) {
      message = templates.expiry_1d(sub.full_name, sub.expiry);
      type    = 'expiry_1d';
    } else {
      message = templates.expiry_today(sub.full_name);
      type    = 'expiry_today';
    }

    const sendResult = await sendWhatsAppMessage({ phone: sub.mobile, message });

    await pool.query(
      `INSERT INTO whatsapp_logs (subscriber_id, phone, message_type, status, wa_message_id, sent_at, error_message)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [sub.id, sub.mobile, type,
       sendResult.success ? 'sent' : 'failed',
       sendResult.messageId || null,
       sendResult.error || null]
    );

    logger.info(`[CRON] ${type} sent to ${sub.full_name} (${sub.mobile}): ${sendResult.success ? 'OK' : sendResult.error}`);

    // Small delay between messages even in cron to be safe
    await new Promise(r => setTimeout(r, 2000));
  }

  logger.info('[CRON] Expiry reminder job complete');
}
