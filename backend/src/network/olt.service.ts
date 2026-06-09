import { Client as SSHClient, ConnectConfig } from 'ssh2';
import { decrypt } from '../crypto/aes';
import { logger } from '../utils/logger';

export interface OLTCredentials {
  ip:                string;
  port:              number;
  username:          string;
  encryptedPassword: string;
  type:              'VSOL' | 'Huawei' | 'ZTE' | 'FiberHome' | 'Other';
}

export interface ONUPowerInfo {
  onu_id:        string;
  serial_number: string;
  status:        string;
  rx_power_dbm:  number | null;
  tx_power_dbm:  number | null;
  distance_m:    number | null;
  last_updated:  string;
}

const SSH_TIMEOUT = 10000;

/**
 * Execute a command on an OLT via SSH and return raw output.
 */
async function sshExec(creds: OLTCredentials, command: string): Promise<string> {
  const password = decrypt(creds.encryptedPassword);

  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let output = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      conn.end();
      reject(new Error(`SSH timeout connecting to OLT at ${creds.ip}:${creds.port}`));
    }, SSH_TIMEOUT);

    const config: ConnectConfig = {
      host:           creds.ip,
      port:           creds.port,
      username:       creds.username,
      password,
      readyTimeout:   SSH_TIMEOUT,
      algorithms: {
        kex: ['diffie-hellman-group14-sha1', 'diffie-hellman-group1-sha1', 'ecdh-sha2-nistp256'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc'],
        serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256'],
        hmac: ['hmac-sha2-256', 'hmac-sha1', 'hmac-md5'],
      },
    };

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }

        stream.on('close', () => {
          clearTimeout(timeout);
          if (!timedOut) { conn.end(); resolve(output); }
        });

        stream.on('data', (data: Buffer) => { output += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      if (!timedOut) {
        logger.warn(`OLT SSH connection error (${creds.ip}): ${err.message}`);
        reject(new Error(`OLT unreachable at ${creds.ip}: ${err.message}`));
      }
    });

    conn.connect(config);
  });
}

/**
 * Parse ONU power info from VSOL OLT output.
 * VSOL format: "show pon power attenuation onu <sn>"
 */
function parseVSOLPower(output: string, serial: string): ONUPowerInfo {
  const rxMatch = output.match(/RX\s+Power[:\s]+(-?[\d.]+)\s*dBm/i);
  const txMatch = output.match(/TX\s+Power[:\s]+(-?[\d.]+)\s*dBm/i);
  const distMatch = output.match(/Distance[:\s]+([\d.]+)\s*m/i);

  return {
    onu_id:       serial,
    serial_number: serial,
    status:       output.includes('Online') ? 'Online' : 'Offline',
    rx_power_dbm: rxMatch ? parseFloat(rxMatch[1]) : null,
    tx_power_dbm: txMatch ? parseFloat(txMatch[1]) : null,
    distance_m:   distMatch ? parseFloat(distMatch[1]) : null,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Parse ONU power info from Huawei MA5800 OLT output.
 */
function parseHuaweiPower(output: string, serial: string): ONUPowerInfo {
  const rxMatch = output.match(/Rx optical power\s*\(dBm\)[:\s]+(-?[\d.]+)/i);
  const txMatch = output.match(/Tx optical power\s*\(dBm\)[:\s]+(-?[\d.]+)/i);
  const distMatch = output.match(/ONU distance\s*\(m\)[:\s]+([\d.]+)/i);

  return {
    onu_id:       serial,
    serial_number: serial,
    status:       output.toLowerCase().includes('active') ? 'Online' : 'Offline',
    rx_power_dbm: rxMatch ? parseFloat(rxMatch[1]) : null,
    tx_power_dbm: txMatch ? parseFloat(txMatch[1]) : null,
    distance_m:   distMatch ? parseFloat(distMatch[1]) : null,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Get ONU optical signal power for a given serial number / MAC.
 */
export async function getONUPower(creds: OLTCredentials, serial: string): Promise<ONUPowerInfo> {
  let command: string;

  switch (creds.type) {
    case 'VSOL':
      command = `show pon power attenuation onu ${serial}`;
      break;
    case 'Huawei':
      command = `display ont optical-info by-sn ${serial}`;
      break;
    case 'ZTE':
      command = `show gpon onu detail-info pon_if gpon-onu_1:1 onu-id 1 sn ${serial}`;
      break;
    default:
      command = `show pon power attenuation onu ${serial}`;
  }

  try {
    const output = await sshExec(creds, command);
    switch (creds.type) {
      case 'Huawei': return parseHuaweiPower(output, serial);
      default:       return parseVSOLPower(output, serial);
    }
  } catch (err) {
    logger.warn(`ONU power query failed for ${serial} on OLT ${creds.ip}: ${err}`);
    throw err;
  }
}

/**
 * Get list of all ONUs on the OLT.
 */
export async function listAllONUs(creds: OLTCredentials): Promise<Record<string, string>[]> {
  let command: string;
  switch (creds.type) {
    case 'VSOL':    command = 'show pon onu all';         break;
    case 'Huawei':  command = 'display ont info summary'; break;
    default:        command = 'show gpon onu summary';    break;
  }

  try {
    const output = await sshExec(creds, command);
    // Parse into lines for display
    return output.split('\n')
      .filter(l => l.trim().length > 0)
      .map((line, i) => ({ line: String(i + 1), content: line.trim() }));
  } catch (err) {
    throw new Error(`OLT list failed: ${err instanceof Error ? err.message : 'Unreachable'}`);
  }
}
