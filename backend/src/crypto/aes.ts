import crypto from 'crypto';

/**
 * AES-256-GCM Encryption Module
 * Used to store MikroTik/OLT passwords securely in the database.
 * Decryption ONLY happens in-memory when the API communicates with hardware.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH  = 16; // 128 bits

function getKey(): Buffer {
  const keyStr = process.env.AES_KEY;
  if (!keyStr || keyStr.length < KEY_LENGTH) {
    throw new Error(`AES_KEY environment variable must be exactly ${KEY_LENGTH} characters`);
  }
  return Buffer.from(keyStr.substring(0, KEY_LENGTH), 'utf8');
}

export interface EncryptedPayload {
  iv:      string;  // hex
  tag:     string;  // hex
  data:    string;  // hex (ciphertext)
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a serialized JSON string safe for database storage.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload: EncryptedPayload = {
    iv:   iv.toString('hex'),
    tag:  authTag.toString('hex'),
    data: encrypted.toString('hex'),
  };
  return JSON.stringify(payload);
}

/**
 * Decrypt a previously encrypted payload.
 * Returns the original plaintext string.
 */
export function decrypt(encryptedJson: string): string {
  const key = getKey();
  let payload: EncryptedPayload;

  try {
    payload = JSON.parse(encryptedJson) as EncryptedPayload;
  } catch {
    throw new Error('Invalid encrypted payload format');
  }

  const iv         = Buffer.from(payload.iv,   'hex');
  const authTag    = Buffer.from(payload.tag,  'hex');
  const ciphertext = Buffer.from(payload.data, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Test: encrypt then immediately decrypt to verify the key works.
 */
export function selfTest(): boolean {
  try {
    const original  = 'test-router-password-12345!@#';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    return decrypted === original;
  } catch {
    return false;
  }
}
