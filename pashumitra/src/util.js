import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export const nowIso = () => new Date().toISOString();

// Remove control characters and angle brackets, collapse whitespace, cap length.
// Characters that are never legitimate in names, notes or search text.
const BAD_CHARS = new RegExp('[' +
  '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F' +   // control characters
  '\\u200B-\\u200F\\u2028-\\u202E\\u2066-\\u2069\\uFEFF' +  // invisible and bidi override characters
  '<>]', 'g');

// Remove control characters and angle brackets, collapse whitespace, cap length.
export function cleanText(value, max = 200) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').replace(BAD_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function reqStr(body, field, { min = 1, max = 200, label = field, pattern, patternMsg } = {}) {
  const v = cleanText(body[field], max + 50);
  if (v.length < min) throw new HttpError(400, `${label} is required` + (min > 1 ? ` (at least ${min} characters)` : ''), field);
  if (v.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`, field);
  if (pattern && !pattern.test(v)) throw new HttpError(400, patternMsg || `${label} has an invalid format`, field);
  return v;
}

export function optStr(body, field, { max = 200, label = field } = {}) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return '';
  if (typeof body[field] !== 'string') throw new HttpError(400, `${label} must be text`, field);
  const v = cleanText(body[field], max + 50);
  if (v.length > max) throw new HttpError(400, `${label} must be at most ${max} characters`, field);
  return v;
}

export function oneOf(body, field, list, { label = field, def } = {}) {
  const v = body[field];
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  if (typeof v !== 'string' || !list.includes(v)) throw new HttpError(400, `${label} must be one of: ${list.join(', ')}`, field);
  return v;
}

export function num(body, field, { min = -Infinity, max = Infinity, label = field, required = false, integer = false } = {}) {
  const v = body[field];
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, `${label} is required`, field);
    return null;
  }
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`, field);
  if (integer && !Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number`, field);
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`, field);
  return n;
}

export function isEmail(s) {
  return typeof s === 'string' && s.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(s);
}

export function isoDate(body, field, { label = field, required = true } = {}) {
  const v = body[field];
  if (!v && !required) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) {
    throw new HttpError(400, `${label} must be a date like 2026-12-31`, field);
  }
  const y = Number(v.slice(0, 4));
  if (y < 2000 || y > 2100) throw new HttpError(400, `${label} is out of range`, field);
  return v;
}

export function phoneDigits(s) {
  const cleaned = cleanText(s, 30).replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (!/^\+?\d{7,15}$/.test(cleaned)) throw new HttpError(400, 'Phone number must have 7 to 15 digits', 'phone');
  return cleaned;
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const normDistrict = (s) => cleanText(s, 60).toLowerCase();

// Spreadsheet formula injection guard for CSV cells.
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
