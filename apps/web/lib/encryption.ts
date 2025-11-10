const IV_LENGTH_BYTES = 16;
const TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedKeyPromise: Promise<CryptoKey> | null = null;
let warnedKeyNormalization = false;
const hasBunHasher = typeof Bun !== 'undefined' && typeof Bun.CryptoHasher === 'function';

const toUint8Array = (buffer: Buffer): Uint8Array =>
  new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

const deriveKeyBytes = async (buffer: Buffer): Promise<Uint8Array> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(digest).subarray(0, KEY_LENGTH_BYTES);
};

const getKeyBytes = async (): Promise<Uint8Array> => {
  const key = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is not set');
  }

  const normalized = key.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error('APP_ENCRYPTION_KEY must be a hex-encoded string');
  }
  const buffer = Buffer.from(normalized, 'hex');
  if (buffer.length === KEY_LENGTH_BYTES) {
    return toUint8Array(buffer);
  }
  if (!warnedKeyNormalization) {
    console.warn(
      `APP_ENCRYPTION_KEY is ${buffer.length} bytes; deriving a ${KEY_LENGTH_BYTES}-byte key via SHA-256.`
    );
    warnedKeyNormalization = true;
  }
  if (hasBunHasher) {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(buffer);
    const digest = hasher.digest();
    return toUint8Array(digest).subarray(0, KEY_LENGTH_BYTES);
  }
  return deriveKeyBytes(buffer);
};

const viewToArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
};

const getCryptoKey = (): Promise<CryptoKey> => {
  if (!cachedKeyPromise) {
    cachedKeyPromise = (async () => {
      const keyMaterial = await getKeyBytes();
      return crypto.subtle.importKey('raw', viewToArrayBuffer(keyMaterial), 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
    })();
  }
  return cachedKeyPromise;
};

const concat = (parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

export async function encryptField(plaintext: string): Promise<string> {
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: TAG_LENGTH_BYTES * 8 },
      key,
      encoder.encode(plaintext)
    );
    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const tagOffset = encryptedBytes.length - TAG_LENGTH_BYTES;
    const ciphertext = encryptedBytes.subarray(0, tagOffset);
    const authTag = encryptedBytes.subarray(tagOffset);
    const payload = concat([iv, authTag, ciphertext]);
    return Buffer.from(payload).toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

export async function decryptField(ciphertext: string): Promise<string> {
  try {
    const key = await getCryptoKey();
    const buffer = Buffer.from(ciphertext, 'base64');
    if (buffer.length < IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
      throw new Error('Ciphertext is too short');
    }
    const iv = buffer.subarray(0, IV_LENGTH_BYTES);
    const authTag = buffer.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + TAG_LENGTH_BYTES);
    const encrypted = buffer.subarray(IV_LENGTH_BYTES + TAG_LENGTH_BYTES);
    const combined = concat([encrypted, authTag]);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: TAG_LENGTH_BYTES * 8 },
      key,
      viewToArrayBuffer(combined)
    );
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

export function hashPassword(password: string): string {
  return Bun.password.hashSync(password, {
    algorithm: 'argon2id',
  });
}
