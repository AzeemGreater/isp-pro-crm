import { RouterOSAPI } from 'node-routeros';
import { decrypt } from '../crypto/aes';
import { logger } from '../utils/logger';

export interface RouterCredentials {
  ip:       string;
  port:     number;
  username: string;
  encryptedPassword: string;
  useTLS?:  boolean;
}

export interface SystemResources {
  uptime:       string;
  version:      string;
  cpu_load:     number;
  free_memory:  number;
  total_memory: number;
  architecture: string;
  board_name:   string;
}

export interface TrafficData {
  interface_name: string;
  rx_bits_per_second: number;
  tx_bits_per_second: number;
  rx_mbps: number;
  tx_mbps: number;
}

export interface ActiveSession {
  name:          string;
  service:       string;
  caller_id:     string;
  address:       string;
  uptime:        string;
  encoding:      string;
}

const CONNECTION_TIMEOUT = 8000; // ms

function createConnection(creds: RouterCredentials): RouterOSAPI {
  const password = decrypt(creds.encryptedPassword);
  
  // Intelligently enable TLS if port is 8729 (API-SSL) unless explicitly overridden
  let enableTls = creds.port === 8729;
  if (creds.useTLS !== undefined) {
    enableTls = creds.useTLS;
  }

  return new RouterOSAPI({
    host:     creds.ip,
    port:     creds.port,
    user:     creds.username,
    password,
    tls:      enableTls ? { rejectUnauthorized: false } : undefined,
    timeout:  CONNECTION_TIMEOUT / 1000,
  });
}

/**
 * Fetch system resource metrics from MikroTik router.
 */
export async function getSystemResources(creds: RouterCredentials): Promise<SystemResources> {
  const conn = createConnection(creds);
  try {
    await conn.connect();
    const [data] = await conn.write('/system/resource/print');
    const mem = parseInt(data['free-memory'] || '0');
    const total = parseInt(data['total-memory'] || '1');
    return {
      uptime:       data['uptime'] || 'unknown',
      version:      data['version'] || 'unknown',
      cpu_load:     parseInt(data['cpu-load'] || '0'),
      free_memory:  Math.round((mem / 1024 / 1024) * 10) / 10,
      total_memory: Math.round((total / 1024 / 1024) * 10) / 10,
      architecture: data['architecture-name'] || 'unknown',
      board_name:   data['board-name'] || 'unknown',
    };
  } catch (err) {
    logger.warn(`MikroTik connection failed (${creds.ip}): ${err}`);
    throw new Error(`Cannot reach router at ${creds.ip}:${creds.port} — ${err instanceof Error ? err.message : 'Timeout'}`);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

/**
 * Get interface traffic statistics (RX/TX in Mbps).
 */
export async function getInterfaceTraffic(
  creds: RouterCredentials,
  interfaces: string[] = ['ether1', 'pppoe-out1']
): Promise<TrafficData[]> {
  const conn = createConnection(creds);
  try {
    await conn.connect();
    const results: TrafficData[] = [];
    for (const iface of interfaces) {
      try {
        const [data] = await conn.write('/interface/monitor-traffic', [`=interface=${iface}`, '=once=']);
        const rxBps = parseInt(data['rx-bits-per-second'] || '0');
        const txBps = parseInt(data['tx-bits-per-second'] || '0');
        results.push({
          interface_name:     iface,
          rx_bits_per_second: rxBps,
          tx_bits_per_second: txBps,
          rx_mbps: Math.round((rxBps / 1_000_000) * 100) / 100,
          tx_mbps: Math.round((txBps / 1_000_000) * 100) / 100,
        });
      } catch {
        // Interface may not exist on all routers
        results.push({ interface_name: iface, rx_bits_per_second: 0, tx_bits_per_second: 0, rx_mbps: 0, tx_mbps: 0 });
      }
    }
    return results;
  } catch (err) {
    throw new Error(`Traffic fetch failed (${creds.ip}): ${err instanceof Error ? err.message : 'Timeout'}`);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

/**
 * Get list of active PPPoE sessions.
 */
export async function getActiveSessions(creds: RouterCredentials): Promise<ActiveSession[]> {
  const conn = createConnection(creds);
  try {
    await conn.connect();
    const data = await conn.write('/ppp/active/print');
    return data.map((session: Record<string, string>) => ({
      name:      session['name']      || '',
      service:   session['service']   || '',
      caller_id: session['caller-id'] || '',
      address:   session['address']   || '',
      uptime:    session['uptime']    || '',
      encoding:  session['encoding']  || '',
    }));
  } catch (err) {
    throw new Error(`Active sessions fetch failed: ${err instanceof Error ? err.message : 'Timeout'}`);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

/**
 * Packet of Disconnect — kick a PPPoE user by username.
 */
export async function kickUser(creds: RouterCredentials, username: string): Promise<void> {
  const conn = createConnection(creds);
  try {
    await conn.connect();

    // Find the active session
    const sessions = await conn.write('/ppp/active/print', [`?name=${username}`]);
    if (sessions.length === 0) {
      throw new Error(`No active PPPoE session found for user: ${username}`);
    }

    const sessionId = sessions[0]['.id'];
    await conn.write('/ppp/active/remove', [`=.id=${sessionId}`]);
    logger.info(`PoD: Kicked PPPoE user ${username} from ${creds.ip}`);
  } catch (err) {
    throw new Error(`PoD failed for ${username}: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

/**
 * Get PPPoE profile stats from MikroTik.
 */
export async function getPPPoEProfiles(creds: RouterCredentials): Promise<Record<string, string>[]> {
  const conn = createConnection(creds);
  try {
    await conn.connect();
    return await conn.write('/ppp/profile/print');
  } catch (err) {
    throw new Error(`Profile fetch failed: ${err instanceof Error ? err.message : 'Timeout'}`);
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}
