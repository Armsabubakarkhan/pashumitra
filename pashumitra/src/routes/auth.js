import { HttpError, reqStr, optStr, oneOf, isEmail, cleanText, phoneDigits, nowIso, normDistrict } from '../util.js';
import { hashPassword, verifyPassword, checkPasswordPolicy, DUMMY_HASH } from '../password.js';
import { createSession, clearSessionCookie, requireAuth, publicUser, limit } from '../auth.js';

export const LANGUAGES = ['en', 'hi', 'ta', 'te', 'kn', 'ml'];
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

export function register(r, { db, audit }) {
  r.add('POST', '/api/auth/register', limit('register', 8, 60 * 60_000), async (ctx) => {
    const b = ctx.body;
    const name = reqStr(b, 'name', { min: 2, max: 80, label: 'Name' });
    const email = cleanText(b.email, 254).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address', 'email');
    const role = oneOf(b, 'role', ['farmer', 'vet'], { label: 'Role', def: 'farmer' });
    const language = oneOf(b, 'language', LANGUAGES, { label: 'Language', def: 'en' });
    const district = normDistrict(optStr(b, 'district', { max: 60, label: 'District' }));
    const phone = phoneDigits(b.phone);
    const clinic = optStr(b, 'clinic', { max: 100, label: 'Clinic' });
    if (b.consent !== true) throw new HttpError(400, 'You must accept the Terms and the Privacy Policy', 'consent');
    if (role === 'vet' && (!phone || !district)) throw new HttpError(400, 'Veterinarians must give a phone number and district so farmers can reach them', 'phone');
    checkPasswordPolicy(b.password, { email, name });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists', 'email');
    const hash = await hashPassword(b.password);
    const info = db.prepare(`INSERT INTO users (name, email, pass_hash, role, verified, language, district, phone, clinic, consent_at, created_at)
      VALUES (?,?,?,?,0,?,?,?,?,?,?)`).run(name, email, hash, role, language, district, phone, clinic, nowIso(), nowIso());
    const id = Number(info.lastInsertRowid);
    audit(id, 'register', role, ctx.ip);
    const { csrf } = createSession(ctx, id);
    ctx.status = 201;
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), csrf };
  });

  r.add('POST', '/api/auth/login', limit('login', 20, 15 * 60_000), async (ctx) => {
    const email = cleanText(ctx.body.email, 254).toLowerCase();
    const password = typeof ctx.body.password === 'string' ? ctx.body.password.slice(0, 200) : '';
    // second limiter keyed by account so one account cannot be hammered from many addresses
    const lim = ctx.limiter.hit('login-acct', email, 15, 15 * 60_000);
    if (!lim.ok) { ctx.res.setHeader('Retry-After', String(lim.retryAfter)); throw new HttpError(429, 'Too many attempts. Try again later'); }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      audit(null, 'login_failed', 'unknown account', ctx.ip);
      throw new HttpError(401, 'Email or password is incorrect');
    }
    if (user.locked_until && user.locked_until > nowIso()) {
      audit(user.id, 'login_blocked', 'account locked', ctx.ip);
      throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes');
    }
    const ok = await verifyPassword(password, user.pass_hash);
    if (!ok) {
      const fails = user.failed_logins + 1;
      if (fails >= MAX_FAILS) {
        db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').run(new Date(Date.now() + LOCK_MS).toISOString(), user.id);
        audit(user.id, 'account_locked', '', ctx.ip);
      } else {
        db.prepare('UPDATE users SET failed_logins = ? WHERE id = ?').run(fails, user.id);
      }
      audit(user.id, 'login_failed', '', ctx.ip);
      throw new HttpError(401, 'Email or password is incorrect');
    }
    if (user.disabled) throw new HttpError(403, 'This account is disabled. Contact the administrator');
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
    const { csrf } = createSession(ctx, user.id);
    audit(user.id, 'login', '', ctx.ip);
    return { user: publicUser(user), csrf };
  });

  r.add('POST', '/api/auth/logout', requireAuth, (ctx) => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(ctx.session.id);
    clearSessionCookie(ctx);
    audit(ctx.user.id, 'logout', '', ctx.ip);
    return { ok: true };
  });

  r.add('GET', '/api/auth/me', (ctx) => {
    if (!ctx.user) return { user: null, csrf: null };
    return { user: publicUser(ctx.user), csrf: ctx.session.csrf };
  });

  r.add('POST', '/api/auth/password', requireAuth, limit('password', 10, 15 * 60_000), async (ctx) => {
    const current = typeof ctx.body.current === 'string' ? ctx.body.current : '';
    if (!(await verifyPassword(current, ctx.user.pass_hash))) throw new HttpError(400, 'Current password is incorrect', 'current');
    checkPasswordPolicy(ctx.body.next, { email: ctx.user.email, name: ctx.user.name });
    const hash = await hashPassword(ctx.body.next);
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, ctx.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(ctx.user.id, ctx.session.id);
    audit(ctx.user.id, 'password_changed', '', ctx.ip);
    return { ok: true };
  });

  r.add('PATCH', '/api/account', requireAuth, (ctx) => {
    const b = ctx.body;
    const u = ctx.user;
    const name = b.name === undefined ? u.name : reqStr(b, 'name', { min: 2, max: 80, label: 'Name' });
    const language = b.language === undefined ? u.language : oneOf(b, 'language', LANGUAGES, { label: 'Language' });
    const district = b.district === undefined ? u.district : normDistrict(optStr(b, 'district', { max: 60, label: 'District' }));
    const phone = b.phone === undefined ? u.phone : phoneDigits(b.phone);
    const clinic = b.clinic === undefined ? u.clinic : optStr(b, 'clinic', { max: 100, label: 'Clinic' });
    db.prepare('UPDATE users SET name=?, language=?, district=?, phone=?, clinic=? WHERE id=?').run(name, language, district, phone, clinic, u.id);
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) };
  });

  r.add('DELETE', '/api/account', requireAuth, limit('account-delete', 5, 60 * 60_000), async (ctx) => {
    if (ctx.user.role === 'admin') throw new HttpError(403, 'Administrator accounts cannot be deleted here');
    const pw = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!(await verifyPassword(pw, ctx.user.pass_hash))) throw new HttpError(400, 'Password is incorrect', 'password');
    db.prepare('DELETE FROM users WHERE id = ?').run(ctx.user.id);
    audit(null, 'account_deleted', `user ${ctx.user.id}`, ctx.ip);
    clearSessionCookie(ctx);
    return { ok: true };
  });
}
