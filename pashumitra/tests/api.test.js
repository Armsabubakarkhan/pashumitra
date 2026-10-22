import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, Client, newFarmer, rawGet } from './helpers.js';

const fmd = { signs: ['drooling', 'limping', 'fever'] };

test('registration, session cookie flags, and validation', async () => {
  const t = await boot();
  try {
    const c = new Client(t.base);
    const weak = await c.post('/api/auth/register', { name: 'A Farmer', email: 'a@example.com', password: 'short', consent: true });
    assert.equal(weak.status, 400);
    const noConsent = await c.post('/api/auth/register', { name: 'A Farmer', email: 'a@example.com', password: 'Field-gate-2026' });
    assert.equal(noConsent.status, 400);
    const asAdmin = await c.post('/api/auth/register', { name: 'A Farmer', email: 'a@example.com', password: 'Field-gate-2026', consent: true, role: 'admin' });
    assert.equal(asAdmin.status, 400, 'self-registering as admin must be refused');
    const ok = await c.post('/api/auth/register', { name: 'A Farmer', email: 'a@example.com', password: 'Field-gate-2026', consent: true });
    assert.equal(ok.status, 201);
    const sc = ok.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    assert.equal(ok.json.user.role, 'farmer');
    assert.equal(ok.json.user.pass_hash, undefined);
    const dup = await new Client(t.base).post('/api/auth/register', { name: 'B Farmer', email: 'A@example.com', password: 'Field-gate-2026', consent: true });
    assert.equal(dup.status, 409);
    const me = await c.get('/api/auth/me');
    assert.equal(me.json.user.email, 'a@example.com');
    const anon = await new Client(t.base).get('/api/auth/me');
    assert.equal(anon.json.user, null);
  } finally { await t.close(); }
});

test('CSRF token is required on state changing requests', async () => {
  const t = await boot();
  try {
    const { c } = await newFarmer(t.base);
    const saved = c.csrf; c.csrf = '';
    const r = await c.post('/api/animals', { tag: 'C1', species: 'cattle' });
    assert.equal(r.status, 403);
    c.csrf = 'wrong-token';
    assert.equal((await c.post('/api/animals', { tag: 'C1', species: 'cattle' })).status, 403);
    c.csrf = saved;
    assert.equal((await c.post('/api/animals', { tag: 'C1', species: 'cattle' })).status, 201);
  } finally { await t.close(); }
});

test('login, lockout after repeated failures, and generic errors', async () => {
  const t = await boot();
  try {
    const { user } = await newFarmer(t.base, { email: 'lock@example.com' });
    const c = new Client(t.base);
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/api/auth/login', { email: 'lock@example.com', password: 'wrong-password-1' });
      assert.equal(r.status, 401);
      assert.equal(r.json.error, 'Email or password is incorrect');
    }
    const blocked = await c.post('/api/auth/login', { email: 'lock@example.com', password: 'Field-gate-2026' });
    assert.equal(blocked.status, 429, 'correct password must not work while locked');
    const unknown = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'Field-gate-2026' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.json.error, 'Email or password is incorrect');
    t.db.prepare('UPDATE users SET locked_until = NULL WHERE id = ?').run(user.id);
    assert.equal((await c.post('/api/auth/login', { email: 'lock@example.com', password: 'Field-gate-2026' })).status, 200);
  } finally { await t.close(); }
});

test('SQL injection strings are treated as data', async () => {
  const t = await boot();
  try {
    const c = new Client(t.base);
    const r = await c.post('/api/auth/login', { email: "' OR 1=1 --", password: "' OR '1'='1" });
    assert.equal(r.status, 401);
    const { c: f } = await newFarmer(t.base);
    const a = await f.post('/api/animals', { tag: "x'); DROP TABLE users;--", species: 'goat' });
    assert.equal(a.status, 201);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM users').get().n >= 2, true);
  } finally { await t.close(); }
});

test('XSS payloads are neutralised on input', async () => {
  const t = await boot();
  try {
    const { c } = await newFarmer(t.base, { name: '<script>alert(1)</script>Ravi' });
    const a = await c.post('/api/animals', { tag: '<img src=x onerror=alert(1)>', species: 'cattle', notes: '<svg onload=alert(1)>' });
    assert.equal(a.status, 201);
    assert.ok(!/[<>]/.test(a.json.animal.tag));
    assert.ok(!/[<>]/.test(a.json.animal.notes));
    const me = await c.get('/api/auth/me');
    assert.ok(!/[<>]/.test(me.json.user.name));
  } finally { await t.close(); }
});

test('farmers cannot see each other\'s animals or scans', async () => {
  const t = await boot();
  try {
    const a = await newFarmer(t.base);
    const b = await newFarmer(t.base);
    const animal = (await a.c.post('/api/animals', { tag: 'A1', species: 'cattle' })).json.animal;
    const scan = (await a.c.post('/api/scans', { animal_id: animal.id, ...fmd })).json.scan;
    assert.equal((await b.c.get(`/api/animals/${animal.id}/card`)).status, 404);
    assert.equal((await b.c.get(`/api/scans/${scan.id}`)).status, 404);
    assert.equal((await b.c.post('/api/scans', { animal_id: animal.id, ...fmd })).status, 404);
    assert.equal((await b.c.post(`/api/scans/${scan.id}/feedback`, { feedback: 'correct' })).status, 404);
    assert.equal((await b.c.del(`/api/animals/${animal.id}`)).status, 404);
    assert.equal((await b.c.get('/api/animals')).json.animals.length, 0);
    assert.equal((await a.c.get(`/api/scans/${scan.id}`)).status, 200);
  } finally { await t.close(); }
});

test('scan produces the FMD alert and the animal card tracks recovery', async () => {
  const t = await boot();
  try {
    const { c } = await newFarmer(t.base);
    const animal = (await c.post('/api/animals', { tag: 'Lakshmi', species: 'cattle' })).json.animal;
    const s1 = await c.post('/api/scans', { animal_id: animal.id, ...fmd, conditions: { temperature_c: 30, humidity: 84, ammonia_ppm: 12 } });
    assert.equal(s1.status, 201);
    assert.equal(s1.json.scan.label, 'fmd');
    assert.equal(s1.json.scan.severity, 'red');
    t.db.prepare("UPDATE scans SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(s1.json.scan.id);
    const s2 = await c.post('/api/scans', { animal_id: animal.id, signs: [] });
    assert.equal(s2.json.scan.severity, 'green');
    const card = await c.get(`/api/animals/${animal.id}/card`);
    assert.equal(card.json.trend, 'improving');
    assert.equal(card.json.scans.length, 2);
    const dash = await c.get('/api/dashboard');
    assert.equal(dash.json.totals.animals, 1);
    assert.equal(dash.json.totals.healthy, 1);
    assert.equal(typeof dash.json.farm_health_score, 'number');
    const cond = await c.get('/api/conditions');
    assert.equal(cond.json.conditions[0].thi_band, 'moderate'); // 30 C at 84 percent humidity gives THI 83.5
    const bad = await c.post('/api/scans', { animal_id: animal.id, signs: ['nope'] });
    assert.equal(bad.status, 400);
  } finally { await t.close(); }
});

test('vet workflow: verification, sharing, review, farmer sees the vet label', async () => {
  const t = await boot();
  try {
    const f = await newFarmer(t.base);
    const animal = (await f.c.post('/api/animals', { tag: 'V1', species: 'cattle' })).json.animal;
    const scan = (await f.c.post('/api/scans', { animal_id: animal.id, ...fmd })).json.scan;

    const vet = new Client(t.base);
    const reg = await vet.post('/api/auth/register', { name: 'Dr Anita Rao', email: 'vet@example.com', password: 'Vet-office-2026', role: 'vet', phone: '+919876543210', district: 'bengaluru urban', consent: true });
    assert.equal(reg.status, 201);
    assert.equal(reg.json.user.verified, false);
    assert.equal((await vet.get('/api/vet/cases')).status, 403, 'unverified vet is locked out');
    assert.equal((await f.c.get('/api/help/vets')).json.vets.length, 0);
    assert.equal((await f.c.post(`/api/scans/${scan.id}/share`, { vet_id: reg.json.user.id })).status, 404);

    const admin = new Client(t.base);
    assert.equal((await admin.post('/api/auth/login', { email: 'boss@example.com', password: 'Admin-pass-2026' })).status, 200);
    assert.equal((await admin.patch(`/api/admin/users/${reg.json.user.id}`, { verified: true })).status, 200);

    assert.equal((await f.c.get('/api/help/vets')).json.vets.length, 1);
    assert.equal((await f.c.post(`/api/scans/${scan.id}/share`, { vet_id: reg.json.user.id })).status, 200);
    const cases = await vet.get('/api/vet/cases?status=pending');
    assert.equal(cases.json.cases.length, 1);
    const detail = await vet.get(`/api/vet/cases/${scan.id}`);
    assert.equal(detail.json.case.tag, 'V1');
    const review = await vet.post(`/api/vet/cases/${scan.id}/review`, { label: 'lsd', note: 'Nodules seen on examination' });
    assert.equal(review.json.vet_status, 'corrected');
    const mine = await f.c.get(`/api/scans/${scan.id}`);
    assert.equal(mine.json.scan.vet_label, 'lsd');
    assert.equal(mine.json.scan.vet_status, 'corrected');

    const other = await newFarmer(t.base);
    assert.equal((await other.c.get('/api/vet/cases')).status, 403);
    assert.equal((await vet.get('/api/animals')).status, 403, 'vets have no farmer endpoints');
  } finally { await t.close(); }
});

test('admin routes: anonymous 401, farmer 403, admin ok; safeguards hold', async () => {
  const t = await boot();
  try {
    const anon = new Client(t.base);
    for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit', '/api/admin/labelled.csv']) assert.equal((await anon.get(p)).status, 401, p);
    const f = await newFarmer(t.base);
    for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit', '/api/admin/labelled.csv']) assert.equal((await f.c.get(p)).status, 403, p);
    assert.equal((await f.c.patch(`/api/admin/users/${f.user.id}`, { role: 'admin' })).status, 403);

    const admin = new Client(t.base);
    const login = await admin.post('/api/auth/login', { email: 'boss@example.com', password: 'Admin-pass-2026' });
    assert.equal(login.status, 200);
    const stats = await admin.get('/api/admin/stats');
    assert.equal(stats.json.users.farmers, 1);
    const users = await admin.get('/api/admin/users');
    assert.ok(users.json.users.every((u) => u.pass_hash === undefined));
    assert.equal((await admin.patch(`/api/admin/users/${login.json.user.id}`, { disabled: true })).status, 400, 'cannot disable self');
    assert.equal((await admin.patch(`/api/admin/users/${login.json.user.id}`, { role: 'farmer' })).status, 400, 'cannot demote self');
    assert.equal((await admin.patch(`/api/admin/users/${f.user.id}`, { disabled: true })).status, 200);
    assert.equal((await f.c.get('/api/animals')).status, 401, 'disabled users lose their session');
    const audit = await admin.get('/api/admin/audit');
    assert.ok(audit.json.entries.some((e) => e.action === 'admin_user_update'));
    const csv = await admin.get('/api/admin/labelled.csv');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.ok(!csv.text.includes('@'), 'export contains no emails');
  } finally { await t.close(); }
});

test('outbreak clusters appear for districts with repeated FMD or LSD suspicion', async () => {
  const t = await boot();
  try {
    const f1 = await newFarmer(t.base);
    const f2 = await newFarmer(t.base);
    for (const f of [f1, f2]) {
      const an = (await f.c.post('/api/animals', { tag: 'O1', species: 'cattle' })).json.animal;
      await f.c.post('/api/scans', { animal_id: an.id, ...fmd });
    }
    const r = await f1.c.get('/api/outbreaks');
    assert.equal(r.json.outbreaks[0].label, 'fmd');
    assert.equal(r.json.outbreaks[0].farms, 2);
    assert.equal(r.json.outbreaks[0].cluster, true);
    assert.deepEqual(Object.keys(r.json.outbreaks[0]).sort(), ['animals', 'cluster', 'district', 'farms', 'label']);
    const far = await newFarmer(t.base, { district: 'Mysuru' });
    assert.equal((await far.c.get('/api/outbreaks')).json.outbreaks.length, 0);
  } finally { await t.close(); }
});

test('Ask AI, analysis endpoints and weather validation need sign in', async () => {
  const t = await boot();
  try {
    const anon = new Client(t.base);
    assert.equal((await anon.post('/api/ask', { question: 'hello there' })).status, 401);
    const { c } = await newFarmer(t.base);
    const dose = await c.post('/api/ask', { question: 'how much oxytetracycline should I inject', species: 'cattle' });
    assert.equal(dose.json.answer.kind, 'blocked');
    assert.equal((await c.post('/api/ask', { question: 'my cow is bloated' })).json.answer.kind, 'emergency');
    assert.equal((await c.post('/api/ask', { question: 'x' })).status, 400);
    const au = await c.post('/api/analyze/audio', { features: { duration: 8, rms: 0.05, peakRms: 0.2, centroid: 1500, peakHz: 300, burstCount: 4, burstRate: 0.5, meanBurstSec: 0.3, maxBurstSec: 0.4, periodicity: 0.1, periodHz: 0, lowRatio: 0.4 } });
    assert.equal(au.json.audio.cls, 'cough');
    assert.equal((await c.post('/api/analyze/audio', { features: { duration: 8 } })).status, 400);
    assert.equal((await c.get('/api/weather?city=a')).status, 400);
  } finally { await t.close(); }
});

test('demo endpoint works without an account and rate limits', async () => {
  const t = await boot();
  try {
    const c = new Client(t.base);
    const r = await c.post('/api/demo/analyze', { species: 'cattle', signs: ['bloat'], conditions: { temperature_c: 35, humidity: 84 } });
    assert.equal(r.status, 200);
    assert.equal(r.json.result.label, 'bloat');
    assert.equal(r.json.result.thi.value, 91.7);
    let last;
    for (let i = 0; i < 45; i++) last = await c.post('/api/demo/analyze', { species: 'cattle', signs: [] });
    assert.equal(last.status, 429);
    assert.ok(last.headers.get('retry-after'));
  } finally { await t.close(); }
});

test('request hardening: headers, CORS, body limits, content types', async () => {
  const t = await boot();
  try {
    const c = new Client(t.base);
    const r = await c.get('/api/health');
    const h = r.headers;
    assert.match(h.get('content-security-policy'), /default-src 'self'/);
    assert.match(h.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(h.get('x-content-type-options'), 'nosniff');
    assert.equal(h.get('x-frame-options'), 'DENY');
    assert.equal(h.get('x-powered-by'), null);
    assert.equal(h.get('access-control-allow-origin'), null);

    const evil = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(evil.status, 403);
    const pre = await fetch(t.base + '/api/animals', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 403);
    assert.equal(pre.headers.get('access-control-allow-origin'), null);

    assert.equal((await c.req('POST', '/api/auth/login', 'not json')).status, 400);
    const wrongType = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'a=b' });
    assert.equal(wrongType.status, 415);
    const big = await c.req('POST', '/api/auth/login', JSON.stringify({ email: 'x'.repeat(400_000) }));
    assert.equal(big.status, 413);
    assert.equal((await c.req('POST', '/api/auth/login', '[1,2]')).status, 400);
    assert.equal((await fetch(t.base + '/api/health', { method: 'TRACE' }).catch(() => ({ status: 0 }))).status === 200, false);
    assert.equal((await c.get('/api/nope')).status, 404);
    assert.equal((await c.req('PATCH', '/api/health', {})).status, 405);
    const e = await c.get('/api/animals/abc/card');
    assert.ok([401, 404].includes(e.status));
    assert.ok(!/at .*\.js:\d+/.test(e.text), 'no stack traces');
  } finally { await t.close(); }
});

test('CORS allowlist permits only configured origins', async () => {
  const t = await boot({ CORS_ORIGINS: 'https://app.example.org' });
  try {
    const ok = await fetch(t.base + '/api/health', { headers: { Origin: 'https://app.example.org' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://app.example.org');
    const no = await fetch(t.base + '/api/health', { headers: { Origin: 'https://other.example.org' } });
    assert.equal(no.headers.get('access-control-allow-origin'), null);
  } finally { await t.close(); }
});

test('static server exposes only the public folder', async () => {
  const t = await boot();
  try {
    assert.equal((await rawGet(t.base, '/')).status, 200);
    for (const p of ['/.env', '/.git/config', '/server.js', '/package.json', '/src/db.js', '/data/pashumitra.db', '/..%2fpackage.json',
      '/%2e%2e/package.json', '/../package.json', '/css/../../package.json', '/js/%00.js', '/public/../server.js', '/.env.example', '//evil.com/x']) {
      const r = await rawGet(t.base, p);
      assert.ok([400, 404].includes(r.status), `${p} returned ${r.status}`);
      assert.ok(!/SESSION_SECRET|DatabaseSync/.test(r.text), p);
    }
  } finally { await t.close(); }
});

test('password change signs out other sessions; account deletion removes data', async () => {
  const t = await boot();
  try {
    const { c, user } = await newFarmer(t.base, { email: 'pw@example.com' });
    const second = new Client(t.base);
    await second.post('/api/auth/login', { email: 'pw@example.com', password: 'Field-gate-2026' });
    assert.equal((await second.get('/api/animals')).status, 200);
    assert.equal((await c.post('/api/auth/password', { current: 'wrong', next: 'New-field-gate-27' })).status, 400);
    assert.equal((await c.post('/api/auth/password', { current: 'Field-gate-2026', next: 'weak' })).status, 400);
    assert.equal((await c.post('/api/auth/password', { current: 'Field-gate-2026', next: 'New-field-gate-27' })).status, 200);
    assert.equal((await second.get('/api/animals')).status, 401);
    assert.equal((await c.get('/api/animals')).status, 200);
    await c.post('/api/animals', { tag: 'Z', species: 'goat' });
    assert.equal((await c.del('/api/account', { password: 'nope' })).status, 400);
    assert.equal((await c.del('/api/account', { password: 'New-field-gate-27' })).status, 200);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM animals WHERE owner_id = ?').get(user.id).n, 0);
    assert.equal(t.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(user.id).n, 0);
  } finally { await t.close(); }
});

test('logout invalidates the session on the server', async () => {
  const t = await boot();
  try {
    const { c } = await newFarmer(t.base);
    const stolen = c.cookie;
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    const replay = new Client(t.base); replay.cookie = stolen;
    assert.equal((await replay.get('/api/animals')).status, 401);
  } finally { await t.close(); }
});

test('vaccination reminders and clinics directory', async () => {
  const t = await boot();
  try {
    const { c } = await newFarmer(t.base);
    const an = (await c.post('/api/animals', { tag: 'Vac1', species: 'cattle' })).json.animal;
    assert.equal((await c.post('/api/vaccinations', { animal_id: an.id, vaccine: 'FMD', due_date: 'tomorrow' })).status, 400);
    const v = await c.post('/api/vaccinations', { animal_id: an.id, vaccine: 'FMD', due_date: '2020-01-01' });
    assert.equal(v.status, 201);
    assert.equal((await c.get('/api/dashboard')).json.vaccinations.overdue, 1);
    assert.equal((await c.patch(`/api/vaccinations/${v.json.vaccination.id}`, { done: true })).status, 200);
    assert.equal((await c.get('/api/dashboard')).json.vaccinations.overdue, 0);
    const clinics = await c.get('/api/help/clinics?district=bengaluru');
    assert.ok(clinics.json.clinics.length >= 2);
    assert.ok(clinics.json.clinics.every((x) => x.is_sample === 1));
  } finally { await t.close(); }
});
