import { HttpError, reqStr, optStr, oneOf, num, nowIso, cleanText, phoneDigits, csvCell } from '../util.js';
import { requireRole, requireVerifiedVet, parseId, limit } from '../auth.js';
import { LABELS } from '../engine.js';
import { outbreakRows } from './farm.js';

const admin = requireRole('admin');

export function register(r, { db, audit }) {
  // ---------- veterinarian ----------
  r.add('GET', '/api/vet/cases', requireVerifiedVet, (ctx) => {
    const status = ['pending', 'reviewed', 'all'].includes(ctx.query.status) ? ctx.query.status : 'all';
    let where = 's.vet_id = ?';
    if (status === 'pending') where += " AND s.vet_status = 'pending'";
    if (status === 'reviewed') where += " AND s.vet_status IN ('confirmed','corrected')";
    const rows = db.prepare(`
      SELECT s.id, s.created_at, s.score, s.severity, s.label, s.confidence, s.vet_status, s.vet_label, s.feedback,
             a.tag, a.species, u.name AS farmer_name, u.phone AS farmer_phone, s.district
      FROM scans s JOIN animals a ON a.id = s.animal_id JOIN users u ON u.id = s.owner_id
      WHERE ${where} ORDER BY (s.vet_status = 'pending') DESC, s.created_at DESC LIMIT 200`).all(ctx.user.id);
    return { cases: rows };
  });

  r.add('GET', '/api/vet/cases/:id', requireVerifiedVet, (ctx) => {
    const row = db.prepare(`
      SELECT s.*, a.tag, a.species, a.breed, a.age_months, a.sex, u.name AS farmer_name, u.phone AS farmer_phone
      FROM scans s JOIN animals a ON a.id = s.animal_id JOIN users u ON u.id = s.owner_id
      WHERE s.id = ? AND s.vet_id = ?`).get(parseId(ctx.params.id), ctx.user.id);
    if (!row) throw new HttpError(404, 'Not found');
    return {
      case: {
        id: row.id, created_at: row.created_at, district: row.district, tag: row.tag, species: row.species, breed: row.breed,
        age_months: row.age_months, sex: row.sex, farmer_name: row.farmer_name, farmer_phone: row.farmer_phone,
        input: JSON.parse(row.input_json), result: JSON.parse(row.result_json), vet_status: row.vet_status,
        vet_label: row.vet_label, vet_note: row.vet_note, feedback: row.feedback
      }
    };
  });

  r.add('POST', '/api/vet/cases/:id/review', requireVerifiedVet, (ctx) => {
    const s = db.prepare('SELECT * FROM scans WHERE id = ? AND vet_id = ?').get(parseId(ctx.params.id), ctx.user.id);
    if (!s) throw new HttpError(404, 'Not found');
    const label = oneOf(ctx.body, 'label', LABELS, { label: 'Diagnosis label' });
    const note = optStr(ctx.body, 'note', { max: 500, label: 'Note' });
    const status = label === s.label ? 'confirmed' : 'corrected';
    db.prepare('UPDATE scans SET vet_status = ?, vet_label = ?, vet_note = ?, vet_reviewed_at = ? WHERE id = ?').run(status, label, note, nowIso(), s.id);
    audit(ctx.user.id, 'case_reviewed', `scan ${s.id} ${status}`, ctx.ip);
    return { ok: true, vet_status: status };
  });

  r.add('GET', '/api/vet/outbreaks', requireVerifiedVet, () => ({ outbreaks: outbreakRows(db, null) }));

  // ---------- admin ----------
  r.add('GET', '/api/admin/stats', admin, () => {
    const one = (sql) => db.prepare(sql).get().n;
    return {
      users: {
        farmers: one("SELECT COUNT(*) AS n FROM users WHERE role = 'farmer'"),
        vets: one("SELECT COUNT(*) AS n FROM users WHERE role = 'vet'"),
        vets_unverified: one("SELECT COUNT(*) AS n FROM users WHERE role = 'vet' AND verified = 0"),
        admins: one("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
      },
      animals: one('SELECT COUNT(*) AS n FROM animals'),
      scans: one('SELECT COUNT(*) AS n FROM scans'),
      scans_reviewed: one("SELECT COUNT(*) AS n FROM scans WHERE vet_status IN ('confirmed','corrected')"),
      scans_marked_wrong: one("SELECT COUNT(*) AS n FROM scans WHERE feedback = 'wrong'")
    };
  });

  r.add('GET', '/api/admin/users', admin, () => ({
    users: db.prepare('SELECT id, name, email, role, verified, disabled, district, phone, clinic, created_at FROM users ORDER BY created_at DESC LIMIT 500').all()
  }));

  r.add('PATCH', '/api/admin/users/:id', admin, (ctx) => {
    const id = parseId(ctx.params.id);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'Not found');
    const b = ctx.body;
    if (id === ctx.user.id && (b.role !== undefined || b.disabled !== undefined)) throw new HttpError(400, 'You cannot change your own role or disable your own account');
    let role = target.role, verified = target.verified, disabled = target.disabled;
    if (b.role !== undefined) role = oneOf(b, 'role', ['farmer', 'vet', 'admin'], { label: 'Role' });
    if (b.verified !== undefined) verified = b.verified === true ? 1 : 0;
    if (b.disabled !== undefined) disabled = b.disabled === true ? 1 : 0;
    if (target.role === 'admin' && (role !== 'admin' || disabled)) {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get().n;
      if (admins <= 1) throw new HttpError(400, 'At least one active administrator must remain');
    }
    db.prepare('UPDATE users SET role = ?, verified = ?, disabled = ? WHERE id = ?').run(role, verified, disabled, id);
    if (role !== target.role || disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); // force fresh sign in
    audit(ctx.user.id, 'admin_user_update', `user ${id} role=${role} verified=${verified} disabled=${disabled}`, ctx.ip);
    return { ok: true };
  });

  r.add('GET', '/api/admin/audit', admin, (ctx) => {
    const lim = Math.min(Math.max(Number(ctx.query.limit) || 100, 1), 500);
    return { entries: db.prepare('SELECT id, user_id, action, detail, ip, created_at FROM audit_log ORDER BY id DESC LIMIT ?').all(lim) };
  });

  r.add('POST', '/api/admin/clinics', admin, limit('write', 120, 10 * 60_000), (ctx) => {
    const b = ctx.body;
    const name = reqStr(b, 'name', { min: 2, max: 100, label: 'Name' });
    const kind = oneOf(b, 'kind', ['hospital', 'clinic', 'ambulance', 'college'], { label: 'Kind' });
    const district = cleanText(reqStr(b, 'district', { min: 2, max: 60, label: 'District' }), 60).toLowerCase();
    const phone = phoneDigits(b.phone);
    const services = optStr(b, 'services', { max: 200, label: 'Services' });
    const lat = num(b, 'lat', { min: -90, max: 90, label: 'Latitude' });
    const lng = num(b, 'lng', { min: -180, max: 180, label: 'Longitude' });
    const info = db.prepare('INSERT INTO clinics (name, kind, district, phone, services, lat, lng, is_sample, created_at) VALUES (?,?,?,?,?,?,?,0,?)')
      .run(name, kind, district, phone, services, lat, lng, nowIso());
    audit(ctx.user.id, 'clinic_added', name, ctx.ip);
    ctx.status = 201;
    return { id: Number(info.lastInsertRowid) };
  });

  r.add('DELETE', '/api/admin/clinics/:id', admin, (ctx) => {
    const info = db.prepare('DELETE FROM clinics WHERE id = ?').run(parseId(ctx.params.id));
    if (!info.changes) throw new HttpError(404, 'Not found');
    audit(ctx.user.id, 'clinic_deleted', String(ctx.params.id), ctx.ip);
    return { ok: true };
  });

  // Labelled data for model retraining: farmer feedback and vet confirmations, with no personal data.
  r.add('GET', '/api/admin/labelled.csv', admin, (ctx) => {
    const rows = db.prepare(`
      SELECT s.id, s.created_at, a.species, s.input_json, s.label, s.confidence, s.vet_status, s.vet_label, s.feedback
      FROM scans s JOIN animals a ON a.id = s.animal_id
      WHERE s.vet_status IN ('confirmed','corrected') OR s.feedback IS NOT NULL ORDER BY s.id`).all();
    const head = ['scan_id', 'created_at', 'species', 'reported_signs', 'tool_label', 'tool_confidence', 'vet_status', 'vet_label', 'farmer_feedback'];
    const lines = [head.join(',')];
    for (const x of rows) {
      let signs = '';
      try { signs = (JSON.parse(x.input_json).signs || []).join(' '); } catch { /* ignore */ }
      lines.push([x.id, x.created_at, x.species, signs, x.label, x.confidence, x.vet_status, x.vet_label, x.feedback].map(csvCell).join(','));
    }
    audit(ctx.user.id, 'labelled_export', `${rows.length} rows`, ctx.ip);
    ctx.raw = { type: 'text/csv; charset=utf-8', body: lines.join('\n') + '\n', headers: { 'Content-Disposition': 'attachment; filename="pashumitra-labelled.csv"' } };
  });
}
