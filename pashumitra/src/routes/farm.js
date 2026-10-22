import {
  HttpError, reqStr, optStr, oneOf, num, isoDate, nowIso, cleanText
} from '../util.js';
import { requireAuth, requireRole, limit, parseId } from '../auth.js';
import {
  SPECIES, SIGN_IDS, LABELS, ACTION_IDS, normalizeInput, normalizeAudio, normalizeMotion, normalizeConditions,
  runFusion, classifyAudio, analyzeMotion, thiBand, ammoniaBand
} from '../engine.js';
import { LIBRARY, SAFE_MEDICATION, answerQuestion } from '../kb.js';
import { weatherFor } from '../weather.js';

const farmer = requireRole('farmer');

function ownedAnimal(db, id, ownerId) {
  const a = db.prepare('SELECT * FROM animals WHERE id = ? AND owner_id = ?').get(id, ownerId);
  if (!a) throw new HttpError(404, 'Animal not found');
  return a;
}

function scanRow(row) {
  return {
    id: row.id, animal_id: row.animal_id, created_at: row.created_at, score: row.score, severity: row.severity,
    label: row.label, confidence: row.confidence, vet_status: row.vet_status, vet_label: row.vet_label,
    vet_note: row.vet_note, vet_reviewed_at: row.vet_reviewed_at, feedback: row.feedback, vet_id: row.vet_id,
    result: JSON.parse(row.result_json)
  };
}

// Outbreak clusters from vet-corrected-or-tool labels in the last 14 days. Counts only, no identities.
export function outbreakRows(db, district) {
  const sql = `
    SELECT district, eff AS label, COUNT(DISTINCT animal_id) AS animals, COUNT(DISTINCT owner_id) AS farms
    FROM (SELECT district, animal_id, owner_id, CASE WHEN vet_status = 'corrected' THEN vet_label ELSE label END AS eff
          FROM scans WHERE created_at >= ? AND district != '') 
    WHERE eff IN ('fmd','lsd','newcastle') ${district ? 'AND district = ?' : ''}
    GROUP BY district, eff ORDER BY animals DESC`;
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const rows = district ? db.prepare(sql).all(since, district) : db.prepare(sql).all(since);
  return rows.map((x) => ({ district: x.district, label: x.label, animals: x.animals, farms: x.farms, cluster: x.animals >= 3 || x.farms >= 2 }));
}

export function register(r, { db, audit }) {
  // ---------- public ----------
  r.add('GET', '/api/health', () => ({ ok: true }));

  r.add('GET', '/api/meta', () => ({ species: SPECIES, signs: SIGN_IDS, labels: LABELS, actions: ACTION_IDS }));

  r.add('POST', '/api/demo/analyze', limit('demo', 40, 10 * 60_000), (ctx) => {
    const b = ctx.body;
    const input = normalizeInput({ species: b.species, signs: b.signs, temp_c: b.temp_c, conditions: b.conditions, motion: b.motion, audio: b.audio });
    return { result: runFusion(input) };
  });

  r.add('POST', '/api/demo/audio', limit('demo', 40, 10 * 60_000), (ctx) => {
    const f = normalizeAudio(ctx.body.features);
    if (!f) throw new HttpError(400, 'features are required', 'features');
    return { audio: classifyAudio(f) };
  });

  r.add('GET', '/api/library', () => ({ items: LIBRARY.map((d) => ({ id: d.id, name: d.name, species: d.species, summary: d.summary })) }));
  r.add('GET', '/api/library/:id', (ctx) => {
    const d = LIBRARY.find((x) => x.id === ctx.params.id);
    if (!d) throw new HttpError(404, 'Not found');
    return { item: d };
  });
  r.add('GET', '/api/medication', () => SAFE_MEDICATION);

  r.add('GET', '/api/help/clinics', requireAuth, (ctx) => {
    const district = cleanText(ctx.query.district || '', 60).toLowerCase();
    const q = cleanText(ctx.query.q || '', 60).toLowerCase();
    let rows = db.prepare('SELECT id, name, kind, district, phone, services, lat, lng, is_sample FROM clinics ORDER BY name').all();
    if (district) rows = rows.filter((c) => c.district.includes(district));
    if (q) rows = rows.filter((c) => (c.name + ' ' + c.services + ' ' + c.district).toLowerCase().includes(q));
    return { clinics: rows.slice(0, 100) };
  });

  r.add('GET', '/api/help/vets', requireAuth, () => ({
    vets: db.prepare("SELECT id, name, district, clinic, phone FROM users WHERE role = 'vet' AND verified = 1 AND disabled = 0 ORDER BY name LIMIT 200").all()
  }));

  // ---------- analysis helpers (signed in) ----------
  r.add('POST', '/api/analyze/audio', requireAuth, limit('analyze', 60, 10 * 60_000), (ctx) => {
    const f = normalizeAudio(ctx.body.features);
    if (!f) throw new HttpError(400, 'features are required', 'features');
    return { audio: classifyAudio(f) };
  });

  r.add('POST', '/api/analyze/motion', requireAuth, limit('analyze', 60, 10 * 60_000), (ctx) => {
    const m = normalizeMotion(ctx.body.motion);
    if (!m) throw new HttpError(400, 'motion is required', 'motion');
    const a = analyzeMotion(m);
    return { motion: { usable: a.usable, total: a.total, active: a.active, uneven: a.uneven, still: a.still, shaky: a.shaky } };
  });

  r.add('GET', '/api/weather', requireAuth, limit('weather', 30, 10 * 60_000), async (ctx) => {
    const city = cleanText(ctx.query.city || '', 80);
    if (city.length < 2) throw new HttpError(400, 'Enter a place name', 'city');
    return { weather: await weatherFor(city) };
  });

  // ---------- animals ----------
  r.add('GET', '/api/animals', farmer, (ctx) => {
    const rows = db.prepare(`
      SELECT a.*, (SELECT id FROM scans s WHERE s.animal_id = a.id ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS last_scan_id
      FROM animals a WHERE a.owner_id = ? ORDER BY a.tag`).all(ctx.user.id);
    const animals = rows.map((a) => {
      const last = a.last_scan_id ? db.prepare('SELECT * FROM scans WHERE id = ?').get(a.last_scan_id) : null;
      return {
        id: a.id, tag: a.tag, species: a.species, breed: a.breed, age_months: a.age_months, sex: a.sex, notes: a.notes,
        last_scan: last ? { id: last.id, created_at: last.created_at, severity: last.severity, label: last.label, score: last.score } : null
      };
    });
    return { animals };
  });

  r.add('POST', '/api/animals', farmer, limit('write', 120, 10 * 60_000), (ctx) => {
    const b = ctx.body;
    const tag = reqStr(b, 'tag', { min: 1, max: 30, label: 'Tag or name' });
    const species = oneOf(b, 'species', SPECIES, { label: 'Species' });
    const breed = optStr(b, 'breed', { max: 60, label: 'Breed' });
    const sex = oneOf(b, 'sex', ['female', 'male', 'unknown'], { label: 'Sex', def: 'unknown' });
    const age = num(b, 'age_months', { min: 0, max: 600, integer: true, label: 'Age in months' });
    const notes = optStr(b, 'notes', { max: 300, label: 'Notes' });
    const count = db.prepare('SELECT COUNT(*) AS n FROM animals WHERE owner_id = ?').get(ctx.user.id).n;
    if (count >= 500) throw new HttpError(400, 'Animal limit reached for this account');
    if (db.prepare('SELECT 1 FROM animals WHERE owner_id = ? AND tag = ?').get(ctx.user.id, tag)) throw new HttpError(409, 'You already have an animal with this tag', 'tag');
    const info = db.prepare('INSERT INTO animals (owner_id, tag, species, breed, age_months, sex, notes, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(ctx.user.id, tag, species, breed, age, sex, notes, nowIso());
    ctx.status = 201;
    return { animal: { id: Number(info.lastInsertRowid), tag, species, breed, age_months: age, sex, notes } };
  });

  r.add('DELETE', '/api/animals/:id', farmer, (ctx) => {
    const a = ownedAnimal(db, parseId(ctx.params.id), ctx.user.id);
    db.prepare('DELETE FROM animals WHERE id = ?').run(a.id);
    return { ok: true };
  });

  r.add('GET', '/api/animals/:id/card', farmer, (ctx) => {
    const a = ownedAnimal(db, parseId(ctx.params.id), ctx.user.id);
    const scans = db.prepare('SELECT * FROM scans WHERE animal_id = ? ORDER BY created_at DESC, id DESC LIMIT 50').all(a.id).map(scanRow);
    let trend = 'none';
    if (scans.length >= 2) {
      const d = scans[0].score - scans[1].score;
      trend = d <= -8 ? 'improving' : d >= 8 ? 'worsening' : 'unchanged';
    }
    const vaccines = db.prepare('SELECT id, vaccine, due_date, done FROM vaccinations WHERE animal_id = ? ORDER BY due_date').all(a.id);
    return {
      animal: { id: a.id, tag: a.tag, species: a.species, breed: a.breed, age_months: a.age_months, sex: a.sex, notes: a.notes },
      scans, trend, vaccines
    };
  });

  // ---------- scans ----------
  r.add('POST', '/api/scans', farmer, limit('scan', 60, 10 * 60_000), (ctx) => {
    const b = ctx.body;
    const animal = ownedAnimal(db, parseId(b.animal_id), ctx.user.id);
    const input = normalizeInput({ ...b, species: animal.species });
    const result = runFusion(input);
    const note = optStr(b, 'note', { max: 300, label: 'Note' });
    const stored = {
      species: input.species, signs: input.signs, temp_c: input.tempC, conditions: input.conditions, note,
      motion: input.motion ? { seconds: input.motion.seconds.length, shaky: input.motion.shaky } : null,
      audio: input.audio
    };
    const created = nowIso();
    const info = db.prepare(`INSERT INTO scans (animal_id, owner_id, district, created_at, input_json, result_json, score, severity, label, confidence)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(animal.id, ctx.user.id, ctx.user.district, created, JSON.stringify(stored), JSON.stringify(result),
      result.score, result.severity, result.label, result.confidence);
    if (input.conditions) {
      db.prepare('INSERT INTO conditions (owner_id, temperature_c, humidity, ammonia_ppm, thi, created_at) VALUES (?,?,?,?,?,?)')
        .run(ctx.user.id, input.conditions.temperature_c, input.conditions.humidity, input.conditions.ammonia_ppm, input.conditions.thi, created);
    }
    ctx.status = 201;
    return { scan: scanRow(db.prepare('SELECT * FROM scans WHERE id = ?').get(Number(info.lastInsertRowid))) };
  });

  function readableScan(ctx, id) {
    const s = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
    if (!s) throw new HttpError(404, 'Not found');
    const u = ctx.user;
    const ok = s.owner_id === u.id || u.role === 'admin' || (u.role === 'vet' && u.verified && s.vet_id === u.id);
    if (!ok) throw new HttpError(404, 'Not found'); // same answer as missing, so ids cannot be probed
    return s;
  }

  r.add('GET', '/api/scans/:id', requireAuth, (ctx) => ({ scan: scanRow(readableScan(ctx, parseId(ctx.params.id))) }));

  r.add('POST', '/api/scans/:id/feedback', farmer, (ctx) => {
    const s = db.prepare('SELECT * FROM scans WHERE id = ? AND owner_id = ?').get(parseId(ctx.params.id), ctx.user.id);
    if (!s) throw new HttpError(404, 'Not found');
    const feedback = oneOf(ctx.body, 'feedback', ['correct', 'wrong'], { label: 'Feedback' });
    db.prepare('UPDATE scans SET feedback = ? WHERE id = ?').run(feedback, s.id);
    return { ok: true, feedback };
  });

  r.add('POST', '/api/scans/:id/share', farmer, (ctx) => {
    const s = db.prepare('SELECT * FROM scans WHERE id = ? AND owner_id = ?').get(parseId(ctx.params.id), ctx.user.id);
    if (!s) throw new HttpError(404, 'Not found');
    const vetId = parseId(ctx.body.vet_id);
    const vet = db.prepare("SELECT id, name, phone FROM users WHERE id = ? AND role = 'vet' AND verified = 1 AND disabled = 0").get(vetId);
    if (!vet) throw new HttpError(404, 'Veterinarian not found');
    db.prepare("UPDATE scans SET vet_id = ?, vet_status = 'pending', vet_label = NULL, vet_note = NULL, vet_reviewed_at = NULL WHERE id = ?").run(vet.id, s.id);
    audit(ctx.user.id, 'report_shared', `scan ${s.id} to vet ${vet.id}`, ctx.ip);
    return { ok: true, vet: { id: vet.id, name: vet.name, phone: vet.phone } };
  });

  // ---------- farm conditions ----------
  r.add('POST', '/api/conditions', farmer, limit('write', 120, 10 * 60_000), (ctx) => {
    const c = normalizeConditions(ctx.body);
    db.prepare('INSERT INTO conditions (owner_id, temperature_c, humidity, ammonia_ppm, thi, created_at) VALUES (?,?,?,?,?,?)')
      .run(ctx.user.id, c.temperature_c, c.humidity, c.ammonia_ppm, c.thi, nowIso());
    ctx.status = 201;
    return { conditions: { ...c, thi_band: thiBand(c.thi).id, ammonia_band: c.ammonia_ppm === null ? null : ammoniaBand(c.ammonia_ppm).id } };
  });

  r.add('GET', '/api/conditions', farmer, (ctx) => {
    const lim = Math.min(Math.max(Number(ctx.query.limit) || 20, 1), 100);
    const rows = db.prepare('SELECT temperature_c, humidity, ammonia_ppm, thi, created_at FROM conditions WHERE owner_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(ctx.user.id, lim);
    return { conditions: rows.map((x) => ({ ...x, thi_band: thiBand(x.thi).id, ammonia_band: x.ammonia_ppm === null ? null : ammoniaBand(x.ammonia_ppm).id })) };
  });

  // ---------- dashboard ----------
  r.add('GET', '/api/dashboard', farmer, (ctx) => {
    const uid = ctx.user.id;
    const animals = db.prepare('SELECT id, tag, species FROM animals WHERE owner_id = ?').all(uid);
    let healthy = 0, atRisk = 0, critical = 0, unscanned = 0, scoreSum = 0, scored = 0;
    const attention = [];
    for (const a of animals) {
      const s = db.prepare('SELECT * FROM scans WHERE animal_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(a.id);
      if (!s) { unscanned += 1; continue; }
      if (s.severity === 'green') healthy += 1; else if (s.severity === 'yellow') atRisk += 1; else critical += 1;
      scoreSum += 100 - s.score; scored += 1;
      if (s.severity !== 'green') attention.push({ animal_id: a.id, tag: a.tag, species: a.species, scan_id: s.id, severity: s.severity, label: s.label, score: s.score, confidence: s.confidence, created_at: s.created_at });
    }
    attention.sort((x, y) => (y.severity === 'red') - (x.severity === 'red') || y.score - x.score);
    const cond = db.prepare('SELECT temperature_c, humidity, ammonia_ppm, thi, created_at FROM conditions WHERE owner_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(uid);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const vac = db.prepare(`SELECT COUNT(*) AS n FROM vaccinations WHERE owner_id = ? AND done = 0 AND due_date <= ?`).get(uid, soon).n;
    const overdue = db.prepare(`SELECT COUNT(*) AS n FROM vaccinations WHERE owner_id = ? AND done = 0 AND due_date < ?`).get(uid, today).n;
    return {
      totals: { animals: animals.length, healthy, at_risk: atRisk, critical, unscanned },
      farm_health_score: scored ? Math.round(scoreSum / scored) : null,
      attention: attention.slice(0, 8),
      conditions: cond ? { ...cond, thi_band: thiBand(cond.thi).id, ammonia_band: cond.ammonia_ppm === null ? null : ammoniaBand(cond.ammonia_ppm).id } : null,
      vaccinations: { due_soon: vac, overdue },
      outbreaks: ctx.user.district ? outbreakRows(db, ctx.user.district) : [],
      district: ctx.user.district
    };
  });

  // ---------- vaccinations ----------
  r.add('GET', '/api/vaccinations', farmer, (ctx) => ({
    vaccinations: db.prepare(`SELECT v.id, v.vaccine, v.due_date, v.done, v.animal_id, a.tag, a.species
      FROM vaccinations v JOIN animals a ON a.id = v.animal_id WHERE v.owner_id = ? ORDER BY v.done, v.due_date`).all(ctx.user.id)
  }));

  r.add('POST', '/api/vaccinations', farmer, limit('write', 120, 10 * 60_000), (ctx) => {
    const a = ownedAnimal(db, parseId(ctx.body.animal_id), ctx.user.id);
    const vaccine = reqStr(ctx.body, 'vaccine', { min: 2, max: 60, label: 'Vaccine' });
    const due = isoDate(ctx.body, 'due_date', { label: 'Due date' });
    const info = db.prepare('INSERT INTO vaccinations (owner_id, animal_id, vaccine, due_date, done, created_at) VALUES (?,?,?,?,0,?)')
      .run(ctx.user.id, a.id, vaccine, due, nowIso());
    ctx.status = 201;
    return { vaccination: { id: Number(info.lastInsertRowid), animal_id: a.id, tag: a.tag, species: a.species, vaccine, due_date: due, done: 0 } };
  });

  r.add('PATCH', '/api/vaccinations/:id', farmer, (ctx) => {
    const v = db.prepare('SELECT * FROM vaccinations WHERE id = ? AND owner_id = ?').get(parseId(ctx.params.id), ctx.user.id);
    if (!v) throw new HttpError(404, 'Not found');
    const done = ctx.body.done === true ? 1 : 0;
    db.prepare('UPDATE vaccinations SET done = ? WHERE id = ?').run(done, v.id);
    return { ok: true, done };
  });

  r.add('DELETE', '/api/vaccinations/:id', farmer, (ctx) => {
    const info = db.prepare('DELETE FROM vaccinations WHERE id = ? AND owner_id = ?').run(parseId(ctx.params.id), ctx.user.id);
    if (!info.changes) throw new HttpError(404, 'Not found');
    return { ok: true };
  });

  // ---------- Ask AI ----------
  r.add('POST', '/api/ask', requireAuth, limit('ask', 40, 10 * 60_000), (ctx) => {
    const question = reqStr(ctx.body, 'question', { min: 3, max: 500, label: 'Question' });
    const species = ctx.body.species ? oneOf(ctx.body, 'species', SPECIES, { label: 'Species' }) : null;
    return { answer: answerQuestion(question, species) };
  });

  // ---------- outbreaks (aggregated, anonymous) ----------
  r.add('GET', '/api/outbreaks', requireAuth, (ctx) => {
    if (ctx.user.role === 'farmer') return { district: ctx.user.district, outbreaks: ctx.user.district ? outbreakRows(db, ctx.user.district) : [] };
    return { district: null, outbreaks: outbreakRows(db, null) };
  });
}
