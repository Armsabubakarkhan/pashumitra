import http from 'node:http';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { ensureAdmin } from '../src/auth.js';

export async function boot(extra = {}) {
  const cfg = loadConfig({
    skipEnvFile: true, NODE_ENV: 'test', SESSION_SECRET: 'test-secret-'.repeat(5), DB_PATH: ':memory:',
    ADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'Admin-pass-2026', ...extra
  });
  const db = openDb(cfg.dbPath);
  await ensureAdmin(db, cfg, { log() {}, warn() {} });
  const app = createApp(cfg, db, { quiet: true });
  const server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    cfg, db, app, base, server,
    async close() { await new Promise((r) => server.close(r)); app.close(); db.close(); }
  };
}

export class Client {
  constructor(base) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async req(method, path, body, headers = {}) {
    const h = { ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    if (this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    let payload;
    if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = typeof body === 'string' ? body : JSON.stringify(body); }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    if (json && json.csrf) this.csrf = json.csrf;
    return { status: res.status, json, text, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b) { return this.req('POST', p, b === undefined ? {} : b); }
  patch(p, b) { return this.req('PATCH', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
}

// raw request with an exact path string, used for traversal tests
export function rawGet(base, rawPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = http.request({ host: u.hostname, port: u.port, method: 'GET', path: rawPath }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, text: data, headers: res.headers }));
    });
    req.on('error', reject); req.end();
  });
}

let n = 0;
export async function newFarmer(base, over = {}) {
  n += 1;
  const c = new Client(base);
  const r = await c.post('/api/auth/register', {
    name: 'Ramesh Kumar', email: `farmer${n}-${Date.now()}@example.com`, password: 'Field-gate-2026', role: 'farmer',
    district: 'Bengaluru Urban', language: 'ta', consent: true, ...over
  });
  if (r.status !== 201) throw new Error('register failed: ' + r.text);
  return { c, user: r.json.user };
}
