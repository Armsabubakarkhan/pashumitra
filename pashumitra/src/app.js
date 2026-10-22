import {
  createRouter, createRateLimiter, createStaticServer, applySecurityHeaders, handleCors, originAllowed,
  readJson, sendJson, sendText, clientIp
} from './http.js';
import { HttpError, nowIso } from './util.js';
import { loadSession } from './auth.js';
import * as authRoutes from './routes/auth.js';
import * as farmRoutes from './routes/farm.js';
import * as staffRoutes from './routes/staff.js';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS']);
const BODY_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

export function createApp(cfg, db, { quiet = false } = {}) {
  const router = createRouter();
  const limiter = createRateLimiter(cfg.rateLimitEnabled);
  const audit = (userId, action, detail, ip) => {
    try {
      db.prepare('INSERT INTO audit_log (user_id, action, detail, ip, created_at) VALUES (?,?,?,?,?)').run(userId ?? null, action, String(detail || '').slice(0, 300), ip || '', nowIso());
    } catch (e) { console.error('audit write failed:', e.message); }
  };
  const deps = { cfg, db, audit };
  authRoutes.register(router, deps);
  farmRoutes.register(router, deps);
  staffRoutes.register(router, deps);

  const serveStatic = createStaticServer(cfg.publicDir);

  const sweep = setInterval(() => {
    try { db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso()); } catch { /* db closed */ }
  }, 10 * 60_000);
  sweep.unref();

  async function handler(req, res) {
    const started = Date.now();
    let pathname = '';
    try {
      applySecurityHeaders(res, cfg);
      if (!ALLOWED_METHODS.has(req.method)) { sendText(res, 405, 'Method not allowed'); return; }
      if (!req.url || req.url.length > 2000 || !req.url.startsWith('/') || req.url.startsWith('//')) { sendText(res, 400, 'Bad request'); return; }
      if (handleCors(req, res, cfg)) return;
      const url = new URL(req.url, 'http://localhost');
      pathname = url.pathname;
      const ip = clientIp(req, cfg);

      const g = limiter.hit('global', ip, 1500, 60_000);
      if (!g.ok) { res.setHeader('Retry-After', String(g.retryAfter)); sendJson(res, 429, { error: 'Too many requests' }); return; }

      if (!pathname.startsWith('/api/')) {
        if (serveStatic(req, res, pathname)) return;
        sendText(res, 404, 'Not found');
        return;
      }

      const found = router.match(req.method === 'HEAD' ? 'GET' : req.method, pathname);
      if (!found) { sendJson(res, 404, { error: 'Not found' }); return; }
      if (found.methodNotAllowed) { sendJson(res, 405, { error: 'Method not allowed' }); return; }

      if (BODY_METHODS.has(req.method) && !originAllowed(req, cfg)) throw new HttpError(403, 'Request origin is not allowed');

      const ctx = {
        req, res, cfg, db, ip, limiter, params: found.params, query: Object.fromEntries(url.searchParams),
        body: {}, user: null, session: null, status: 200, raw: null
      };
      loadSession(ctx);

      if (BODY_METHODS.has(req.method)) {
        const len = req.headers['content-length'];
        const chunked = !!req.headers['transfer-encoding'];
        if (chunked || (len !== undefined && len !== '0')) ctx.body = await readJson(req);
        else req.resume();
      }

      let result;
      for (const h of found.handlers) {
        result = await h(ctx);
        if (res.writableEnded) return;
        if (ctx.raw) break;
        if (result !== undefined) break;
      }
      if (ctx.raw) {
        sendText(res, 200, ctx.raw.body, ctx.raw.type, ctx.raw.headers);
      } else {
        sendJson(res, ctx.status, result === undefined ? { ok: true } : result);
      }
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      } else {
        console.error('Unhandled error:', err && err.stack ? err.stack : err); // server log only, never sent to the client
        sendJson(res, 500, { error: 'Something went wrong. Please try again' });
      }
    } finally {
      if (!quiet && pathname.startsWith('/api/')) {
        console.log(JSON.stringify({ t: nowIso(), m: req.method, p: pathname, s: res.statusCode, ms: Date.now() - started }));
      }
    }
  }

  return { handler, limiter, close() { clearInterval(sweep); } };
}
