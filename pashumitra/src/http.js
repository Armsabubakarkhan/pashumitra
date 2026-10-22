import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './util.js';

// ---------- router ----------
export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, ...handlers) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
      routes.push({ method, re, keys, handlers });
    },
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = ''; } });
        return { handlers: r.handlers, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    }
  };
}

// ---------- responses ----------
export function sendJson(res, status, obj) {
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export function sendText(res, status, text, type = 'text/plain; charset=utf-8', extra = {}) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store', ...extra });
  res.end(text);
}

export function readJson(req, limit = 200_000) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '').toLowerCase();
    if (!ct.startsWith('application/json')) { req.resume(); return reject(new HttpError(415, 'Content-Type must be application/json')); }
    let size = 0, tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { tooBig = true; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'Request body is too large'));
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        const v = text ? JSON.parse(text) : {};
        if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
        resolve(v);
      } catch { reject(new HttpError(400, 'Request body is not valid JSON')); }
    });
    req.on('error', () => reject(new HttpError(400, 'Could not read request body')));
  });
}

// ---------- cookies ----------
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!(k in out)) out[k] = v;
  }
  return out;
}

export function cookieHeader(name, value, { maxAge, secure }) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// ---------- security headers ----------
export function applySecurityHeaders(res, cfg) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];
  if (cfg.cookieSecure) csp.push('upgrade-insecure-requests');
  res.setHeader('Content-Security-Policy', csp.join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  if (cfg.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// ---------- CORS ----------
// Returns true when the request was fully answered (preflight or blocked).
export function handleCors(req, res, cfg) {
  const origin = req.headers.origin;
  if (!origin) return false;
  let sameOrigin = false;
  try { sameOrigin = new URL(origin).host === req.headers.host; } catch { /* invalid origin header */ }
  const allowed = sameOrigin || cfg.corsOrigins.includes(origin);
  if (allowed && !sameOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!allowed) { res.writeHead(403); res.end(); return true; }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
    res.setHeader('Access-Control-Max-Age', '600');
    res.writeHead(204); res.end();
    return true;
  }
  return false;
}

export function originAllowed(req, cfg) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin form posts and non-browser clients; cookies are SameSite=Strict
  try { if (new URL(origin).host === req.headers.host) return true; } catch { return false; }
  return cfg.corsOrigins.includes(origin);
}

// ---------- rate limiting ----------
export function createRateLimiter(enabled = true) {
  const buckets = new Map();
  const timer = setInterval(() => {
    const t = Date.now();
    for (const [k, v] of buckets) if (v.reset <= t) buckets.delete(k);
  }, 60_000);
  timer.unref();
  return {
    // returns {ok, retryAfter}
    hit(name, key, limit, windowMs) {
      if (!enabled) return { ok: true, retryAfter: 0 };
      const id = `${name}:${key}`;
      const t = Date.now();
      let b = buckets.get(id);
      if (!b || b.reset <= t) { b = { count: 0, reset: t + windowMs }; buckets.set(id, b); }
      b.count += 1;
      if (b.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((b.reset - t) / 1000)) };
      return { ok: true, retryAfter: 0 };
    },
    clear() { buckets.clear(); }
  };
}

export function clientIp(req, cfg) {
  const remote = req.socket.remoteAddress || 'unknown';
  if (!cfg.trustProxy) return remote;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff[xff.length - cfg.trustProxy] || remote;
}

// ---------- static files ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

export function createStaticServer(rootDir) {
  const root = fs.realpathSync(rootDir);
  return function serve(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return false; }
    if (rel.includes('\0') || rel.includes('\\')) return false;
    if (rel === '/' || rel === '') rel = '/index.html';
    const segments = rel.split('/').filter(Boolean);
    if (segments.some(s => s.startsWith('.') || s === '..')) return false; // no dotfiles, no traversal
    const file = path.join(root, ...segments);
    if (!file.startsWith(root + path.sep)) return false;
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return false;
    let stat;
    try { stat = fs.statSync(file); } catch { return false; }
    if (!stat.isFile()) return false;
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    return true;
  };
}
