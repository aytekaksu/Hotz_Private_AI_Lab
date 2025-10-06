import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits

function getEncryptionKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(key, 'hex');
}

export function encryptField(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Concatenate: IV (16 bytes) + Auth Tag (16 bytes) + Encrypted Data
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

export function decryptField(ciphertext: string): string {
  try {
    const key = getEncryptionKey();
    const buffer = Buffer.from(ciphertext, 'base64');
    
    // Extract components
    const iv = buffer.subarray(0, 16);
    const authTag = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}


