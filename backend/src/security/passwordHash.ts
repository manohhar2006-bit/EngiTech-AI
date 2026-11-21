import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64
};

/**
 * Hashes a password using Node.js native scrypt with a fresh 16-byte CSPRNG salt.
 * Output format: scrypt$N=16384,r=8,p=1$<saltB64>$<hashB64>
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be a string with at least 8 characters.');
  }
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  });
  return `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verifies a plaintext password against a stored scrypt hash using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || typeof password !== 'string' || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    return false;
  }

  const paramMatches = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1]);
  if (!paramMatches) {
    return false;
  }

  const N = Number(paramMatches[1]);
  const r = Number(paramMatches[2]);
  const p = Number(paramMatches[3]);
  if (!Number.isInteger(N) || N < 1024 || N > 1048576 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) {
    return false;
  }

  let salt: Buffer;
  let expectedHash: Buffer;
  try {
    salt = Buffer.from(parts[2], 'base64');
    expectedHash = Buffer.from(parts[3], 'base64');
  } catch {
    return false;
  }

  if (salt.length < 8 || expectedHash.length < 32 || expectedHash.length > 128) {
    return false;
  }

  try {
    const derived = await scryptAsync(password, salt, expectedHash.length, { N, r, p });
    return derived.length === expectedHash.length && crypto.timingSafeEqual(derived, expectedHash);
  } catch {
    return false;
  }
}

export function isValidScryptHashFormat(storedHash: string | undefined): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  if (!/^N=\d+,r=\d+,p=\d+$/.test(parts[1])) return false;
  try {
    const salt = Buffer.from(parts[2], 'base64');
    const hash = Buffer.from(parts[3], 'base64');
    return salt.length >= 8 && hash.length >= 32;
  } catch {
    return false;
  }
}

