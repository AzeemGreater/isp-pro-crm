/**
 * WhatsApp Service — Using Baileys (open-source, QR-scan based)
 * Baileys connects your WhatsApp account via QR code scan in the browser.
 *
 * Install: npm install @whiskeysockets/baileys
 */

import { logger } from '../utils/logger';

// Dynamic import to handle cases where baileys is not installed
let baileys: typeof import('@whiskeysockets/baileys') | null = null;
let sock: ReturnType<typeof import('@whiskeysockets/baileys').makeWASocket> | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error' = 'disconnected';
let currentQR: string | null = null;
let initializing = false;
let lastError: string | null = null;

export interface WhatsAppMessage {
  phone:   string;
  message: string;
}

export interface SendResult {
  success:    boolean;
  messageId?: string;
  error?:     string;
}

export interface BulkOptions {
  safeMode:    boolean;
  minDelaySec: number;
  maxDelaySec: number;
  onSent?:     (msg: WhatsAppMessage, result: SendResult, index: number) => Promise<void>;
}

/** Normalize phone number to WhatsApp format */
function normalizePhone(phone: string): string {
  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) {
    normalized = '92' + normalized.substring(1); // Pakistan country code
  }
  if (!normalized.startsWith('92') && normalized.length === 10) {
    normalized = '92' + normalized;
  }
  return normalized + '@s.whatsapp.net';
}

/** Initialize Baileys connection */
export async function initWhatsApp(forceRestart = false): Promise<void> {
  if (initializing) {
    return;
  }

  if (!forceRestart && (connectionStatus === 'connecting' || connectionStatus === 'connected' || connectionStatus === 'qr_ready')) {
    return;
  }

  initializing = true;

  try {
    baileys = await import('@whiskeysockets/baileys');
    const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = baileys;
    const { state, saveCreds } = await useMultiFileAuthState('./whatsapp-auth');

    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        // best-effort socket shutdown
      }
      sock = null;
    }

    connectionStatus = 'connecting';
    currentQR = null;
    lastError = null;
    logger.info('Initializing WhatsApp Baileys connection...');

    sock = makeWASocket({
      auth:     state,
      browser:  Browsers.ubuntu('ISP-CRM'),
      printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR       = qr;
        connectionStatus = 'qr_ready';
        logger.info('WhatsApp QR code generated — visit /api/whatsapp/qr to scan');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'disconnected';
        currentQR        = null;
        sock = null;
        if (shouldReconnect) {
          logger.warn('WhatsApp connection closed, reconnecting in 5s...');
          setTimeout(() => { initWhatsApp().catch(e => logger.error('WA reconnect failed:', e)); }, 5000);
        } else {
          logger.warn('WhatsApp logged out — delete ./whatsapp-auth and restart to re-pair');
          connectionStatus = 'error';
          lastError = 'Logged out from WhatsApp. Re-pair required.';
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        currentQR        = null;
        logger.info('✅ WhatsApp connected successfully via Baileys');
      }
    });
  } catch (err) {
    logger.error('WhatsApp init failed (is @whiskeysockets/baileys installed?):', err);
    connectionStatus = 'error';
    lastError = err instanceof Error ? err.message : 'Unknown WhatsApp init error';
  } finally {
    initializing = false;
  }
}

export async function disconnectWhatsApp(): Promise<void> {
  try {
    if (sock) {
      sock.end(undefined);
      sock = null;
    }
  } catch (err) {
    logger.warn('WhatsApp socket close failed:', err);
  }

  connectionStatus = 'disconnected';
  currentQR = null;
  lastError = null;
}

/** Get current connection status and QR code */
export function getConnectionStatus() {
  return {
    connected: connectionStatus === 'connected',
    status:    connectionStatus,
    qr:        currentQR,
    initializing,
    error: lastError,
  };
}

/** Send a single WhatsApp message */
export async function sendWhatsAppMessage(msg: WhatsAppMessage): Promise<SendResult> {
  if (!sock || connectionStatus !== 'connected') {
    logger.warn(`WhatsApp not connected (status: ${connectionStatus}), message to ${msg.phone} dropped`);
    return { success: false, error: `WhatsApp not connected (${connectionStatus})` };
  }

  try {
    const jid    = normalizePhone(msg.phone);
    const result = await sock.sendMessage(jid, { text: msg.message });
    return { success: true, messageId: result?.key.id || undefined };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Send failed';
    logger.error(`WhatsApp send failed to ${msg.phone}: ${error}`);
    return { success: false, error };
  }
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Send bulk messages with optional Safe Mode delay */
export async function sendBulkWhatsApp(messages: WhatsAppMessage[], options: BulkOptions): Promise<void> {
  logger.info(`Bulk WhatsApp: ${messages.length} messages, safeMode=${options.safeMode}`);

  for (let i = 0; i < messages.length; i++) {
    const msg    = messages[i];
    const result = await sendWhatsAppMessage(msg);

    if (options.onSent) {
      await options.onSent(msg, result, i);
    }

    // Safe Mode: add random delay between messages to prevent ban
    if (options.safeMode && i < messages.length - 1) {
      const delaySec = options.minDelaySec + Math.random() * (options.maxDelaySec - options.minDelaySec);
      logger.debug(`Safe Mode: waiting ${delaySec.toFixed(1)}s before next message`);
      await sleep(delaySec * 1000);
    }
  }

  logger.info(`Bulk WhatsApp campaign completed: ${messages.length} messages sent`);
}

// Message templates
export const templates = {
  welcome: (name: string, pppoeUser: string, plan: string, expiry: string) =>
    `🎉 *Welcome to our ISP!*\n\nDear *${name}*, your account has been activated.\n\n📌 PPPoE Username: \`${pppoeUser}\`\n📦 Plan: ${plan}\n📅 Valid until: ${expiry}\n\n📞 Support: Call or WhatsApp us anytime.`,

  expiry_3d: (name: string, expiry: string, price: string) =>
    `⏰ *Renewal Reminder*\n\nDear *${name}*, your internet subscription expires in *3 days* on ${expiry}.\n\n💰 Renewal amount: Rs. ${price}\n\nRenew now to avoid interruption!`,

  expiry_1d: (name: string, expiry: string) =>
    `🚨 *Urgent: Account Expiring Tomorrow!*\n\nDear *${name}*, your connection expires *tomorrow* on ${expiry}.\n\nPlease renew immediately to avoid disconnection.`,

  expiry_today: (name: string) =>
    `❌ *Service Suspended*\n\nDear *${name}*, your subscription has expired today.\n\nContact us to renew and restore your connection.`,

  payment_receipt: (name: string, amount: string, invoice: string, plan: string, expiry: string) =>
    `✅ *Payment Received*\n\nDear *${name}*,\n\n🧾 Invoice: ${invoice}\n💰 Amount: Rs. ${amount}\n📦 Plan: ${plan}\n📅 Valid until: ${expiry}\n\nThank you for your payment!`,
};
