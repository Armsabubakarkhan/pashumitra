// Black-box security probe against a running server: node scripts/security-test.js http://127.0.0.1:3000
const base = process.argv[2] || 'http://127.0.0.1:3000';
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const j = async (p, o = {}) => { const r = await fetch(base + p, o); let b = null; try { b = await r.clone().json(); } catch { /* not json */ } return { r, b, t: await r.text() }; };

const h = await j('/api/health');
ok(h.r.status === 200, 'server reachable');
ok(!!h.r.headers.get('content-security-policy'), 'Content-Security-Policy header set');
ok(h.r.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options nosniff');
ok(h.r.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options DENY');
ok(!h.r.headers.get('x-powered-by') && !h.r.headers.get('server'), 'no server or framework banner');
for (const p of ['/.env', '/.git/config', '/server.js', '/package.json', '/src/config.js', '/data/pashumitra.db', '/scripts/setup.js', '/tests/api.test.js']) {
  const x = await fetch(base + p); const t = await x.text();
  ok(x.status === 404 && !/SESSION_SECRET|DatabaseSync|"name"/.test(t), 'not exposed: ' + p);
}
for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit', '/api/admin/labelled.csv', '/api/animals', '/api/dashboard', '/api/vet/cases']) {
  ok((await fetch(base + p)).status === 401, 'requires sign in: ' + p);
}
const evil = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
ok(evil.status === 403, 'cross-origin POST rejected');
const noCsrf = await fetch(base + '/api/animals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
ok(noCsrf.status === 401, 'unauthenticated write rejected');
const sqli = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: "' OR 1=1 --", password: 'x' }) });
ok(sqli.r.status === 401 || sqli.r.status === 429, 'SQL injection in login rejected');
const bad = await j('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
ok(bad.r.status === 400 && !/at .*\.js/.test(bad.t), 'malformed JSON gives clean 400, no stack trace');
let limited = false;
for (let i = 0; i < 60 && !limited; i++) {
  const r = await fetch(base + '/api/demo/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"species":"cattle"}' });
  limited = r.status === 429;
}
ok(limited, 'rate limiting engages on repeated requests');
console.log(failed ? `\n${failed} check(s) failed` : '\nAll security checks passed');
process.exit(failed ? 1 : 0);
