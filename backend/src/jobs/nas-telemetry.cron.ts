import cron from 'node-cron';
import net from 'net';
import { pool } from '../db/pool';
import { logger } from '../utils/logger';

function tcpPing(ip: string, port: number, timeout = 3000): Promise<{ online: boolean; latency: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    socket.connect(port, ip, () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ online: true, latency });
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve({ online: false, latency: -1 });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ online: false, latency: -1 });
    });
  });
}

export function startNasTelemetryCron(): void {
  // Run every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      // Ensure table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS nas_telemetry (
          id SERIAL PRIMARY KEY,
          nas_id INT REFERENCES nas_routers(id) ON DELETE CASCADE,
          latency_ms INT NOT NULL,
          is_online BOOLEAN NOT NULL,
          checked_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const routersRes = await pool.query(
        'SELECT id, ip_address, api_port FROM nas_routers WHERE is_active = true'
      );
      
      for (const router of routersRes.rows) {
        const { id, ip_address, api_port } = router;
        const res = await tcpPing(ip_address, api_port);
        
        await pool.query(
          `INSERT INTO nas_telemetry (nas_id, latency_ms, is_online) 
           VALUES ($1, $2, $3)`,
          [id, res.online ? res.latency : 0, res.online]
        );
      }
      
      // Auto-cleanup logs older than 7 days
      await pool.query(
        "DELETE FROM nas_telemetry WHERE checked_at < NOW() - INTERVAL '7 days'"
      );
      
    } catch (err) {
      logger.error('[CRON] NAS Telemetry job failed:', err);
    }
  });
  
  logger.info('[CRON] NAS Telemetry scheduled: every 2 minutes');
}
