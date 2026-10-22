import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './util.js';

const scrypt = promisify(crypto.scrypt);
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const OPTS = { N, r: R, p: P, maxmem: 128 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, OPTS);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024 });
    return crypto.timingSafeEqual(key, expected);
  } catch { return false; }
}

// A real hash of a throwaway value, used to keep login timing equal when the email is unknown.
export const DUMMY_HASH = await hashPassword(crypto.randomBytes(12).toString('hex'));

const COMMON = new Set(['password123', 'password1234', '1234567890', 'qwerty12345', 'letmein1234', 'welcome1234',
  'admin12345', 'iloveyou123', 'pashumitra1', 'pashumitra123', 'abcd123456', 'changeme123', 'test123456']);

export function checkPasswordPolicy(password, { email = '', name = '' } = {}) {
  if (typeof password !== 'string') throw new HttpError(400, 'Password is required', 'password');
  if (password.length < 10) throw new HttpError(400, 'Password must be at least 10 characters', 'password');
  if (password.length > 128) throw new HttpError(400, 'Password must be at most 128 characters', 'password');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new HttpError(400, 'Password must contain letters and at least one digit', 'password');
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) throw new HttpError(400, 'That password is too common. Choose another', 'password');
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) throw new HttpError(400, 'Password must not contain your email name', 'password');
  const first = String(name).split(' ')[0].toLowerCase();
  if (first.length >= 4 && lower.includes(first)) throw new HttpError(400, 'Password must not contain your name', 'password');
}
