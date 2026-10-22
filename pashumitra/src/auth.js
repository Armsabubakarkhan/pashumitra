import { HttpError, hmac, randomToken, safeEqual, nowIso } from './util.js';
import { parseCookies, cookieHeader } from './http.js';
import { hashPassword } from './password.js';
import { checkPasswordPolicy } from './password.js';
import { isEmail } from './util.js';

export const cookieName = (cfg) => (cfg.cookieSecure ? '__Host-pm_sid' : 'pm_sid');

export function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, verified: !!u.verified,
    language: u.language, district: u.district, phone: u.phone, clinic: u.clinic
  };
}

export function createSession(ctx, userId) {
  const { cfg, db, ip } = ctx;
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expires = new Date(Date.now() + cfg.sessionHours * 3600_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, csrf, ip, created_at, expires_at) VALUES (?,?,?,?,?,?)')
    .run(hmac(cfg.sessionSecret, token), userId, csrf, ip || '', nowIso(), expires);
  ctx.res.setHeader('Set-Cookie', cookieHeader(cookieName(cfg), token, { maxAge: cfg.sessionHours * 3600, secure: cfg.cookieSecure }));
  return { csrf, expires };
}

export function clearSessionCookie(ctx) {
  ctx.res.setHeader('Set-Cookie', cookieHeader(cookieName(ctx.cfg), '', { maxAge: 0, secure: ctx.cfg.cookieSecure }));
}

// Loads ctx.user and ctx.session from the cookie. Never throws.
export function loadSession(ctx) {
  const token = parseCookies(ctx.req.headers.cookie)[cookieName(ctx.cfg)];
  ctx.user = null; ctx.session = null;
  if (!token || token.length > 100) return;
  const id = hmac(ctx.cfg.sessionSecret, token);
  const row = ctx.db.prepare(
    `SELECT s.id AS sid, s.csrf, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
  ).get(id);
  if (!row) return;
  if (row.expires_at <= nowIso() || row.disabled) {
    ctx.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return;
  }
  ctx.session = { id, csrf: row.csrf };
  ctx.user = row;
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

export function requireAuth(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Please sign in');
  if (!SAFE_METHODS.has(ctx.req.method)) {
    const sent = ctx.req.headers['x-csrf-token'];
    if (typeof sent !== 'string' || !safeEqual(sent, ctx.session.csrf)) throw new HttpError(403, 'Security check failed. Reload the page and try again');
  }
}

export const requireRole = (...roles) => (ctx) => {
  requireAuth(ctx);
  if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'You do not have access to this');
};

export function requireVerifiedVet(ctx) {
  requireAuth(ctx);
  if (ctx.user.role !== 'vet') throw new HttpError(403, 'Only veterinarians can use this');
  if (!ctx.user.verified) throw new HttpError(403, 'Your veterinarian account is waiting for administrator verification');
}

export const limit = (name, max, windowMs) => (ctx) => {
  const r = ctx.limiter.hit(name, ctx.ip, max, windowMs);
  if (!r.ok) {
    ctx.res.setHeader('Retry-After', String(r.retryAfter));
    throw new HttpError(429, 'Too many requests. Please wait a moment and try again');
  }
};

export function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 2_000_000_000) throw new HttpError(404, 'Not found');
  return n;
}

export async function ensureAdmin(db, cfg, log = console) {
  const has = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
  if (has) return;
  if (!cfg.adminEmail || !cfg.adminPassword) {
    log.warn('No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart to create one.');
    return;
  }
  if (!isEmail(cfg.adminEmail)) throw new Error('ADMIN_EMAIL is not a valid email address');
  checkPasswordPolicy(cfg.adminPassword, { email: cfg.adminEmail, name: 'Administrator' });
  const hash = await hashPassword(cfg.adminPassword);
  db.prepare(`INSERT INTO users (name, email, pass_hash, role, verified, language, district, consent_at, created_at)
              VALUES ('Administrator', ?, ?, 'admin', 1, 'en', '', ?, ?)`).run(cfg.adminEmail, hash, nowIso(), nowIso());
  log.log(`Created administrator account ${cfg.adminEmail}. Change the password after signing in and remove ADMIN_PASSWORD from .env.`);
}
