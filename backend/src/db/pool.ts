import { Pool, PoolConfig, PoolClient } from 'pg';
import { logger } from '../utils/logger';

const config: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
};

export const pool = new Pool(config);

pool.on('connect', () => {
  logger.debug('New DB client connected to pool');
});

pool.on('error', (err) => {
  logger.error('Idle DB client error:', err);
});

/**
 * Helper: run a single query with automatic client management
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug(`Query executed in ${duration}ms | rows: ${res.rowCount}`);
  return res.rows as T[];
}

/**
 * Helper: run multiple queries in a single transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
