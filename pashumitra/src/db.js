import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('farmer','vet','admin')),
  verified INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  district TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  clinic TEXT NOT NULL DEFAULT '',
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS animals (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  species TEXT NOT NULL CHECK (species IN ('cattle','buffalo','sheep','goat','poultry')),
  breed TEXT NOT NULL DEFAULT '',
  age_months INTEGER,
  sex TEXT NOT NULL DEFAULT 'unknown' CHECK (sex IN ('female','male','unknown')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, tag)
);
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY,
  animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  district TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('green','yellow','red')),
  label TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  vet_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  vet_status TEXT NOT NULL DEFAULT 'none' CHECK (vet_status IN ('none','pending','confirmed','corrected')),
  vet_label TEXT,
  vet_note TEXT,
  vet_reviewed_at TEXT,
  feedback TEXT CHECK (feedback IN ('correct','wrong'))
);
CREATE INDEX IF NOT EXISTS idx_scans_animal ON scans(animal_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scans_vet ON scans(vet_id, vet_status);
CREATE INDEX IF NOT EXISTS idx_scans_district ON scans(district, label, created_at);
CREATE TABLE IF NOT EXISTS conditions (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  temperature_c REAL NOT NULL,
  humidity REAL NOT NULL,
  ammonia_ppm REAL,
  thi REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conditions_owner ON conditions(owner_id, created_at);
CREATE TABLE IF NOT EXISTS vaccinations (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
  vaccine TEXT NOT NULL,
  due_date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clinics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hospital','clinic','ambulance','college')),
  district TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
`;

// Sample directory entries so the Nearby Help page has content on a fresh install.
// They are marked as samples in the app. Real entries are added by administrators.
const SAMPLE_CLINICS = [
  ['Sample District Veterinary Hospital', 'hospital', 'bengaluru urban', '', 'Outpatient care, vaccination, large animal surgery', 12.9716, 77.5946],
  ['Sample Village Veterinary Dispensary', 'clinic', 'bengaluru rural', '', 'Outpatient care, artificial insemination', 13.2846, 77.6078],
  ['Sample 24x7 Animal Ambulance', 'ambulance', 'bengaluru urban', '', 'Transport of sick large animals', 12.9352, 77.6245],
  ['Sample Veterinary College Clinic', 'college', 'bengaluru urban', '', 'Specialist referral, laboratory tests', 13.0358, 77.5970],
  ['Sample Government Veterinary Hospital', 'hospital', 'mysuru', '', 'Outpatient care, vaccination, disease reporting', 12.2958, 76.6394],
  ['Sample Veterinary Clinic', 'clinic', 'chennai', '', 'Outpatient care, small ruminant and poultry cases', 13.0827, 80.2707],
  ['Sample Veterinary Hospital', 'hospital', 'coimbatore', '', 'Outpatient care, mastitis and fertility', 11.0168, 76.9558],
  ['Sample Animal Ambulance', 'ambulance', 'madurai', '', 'Transport of sick large animals', 9.9252, 78.1198]
];

export function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    try { fs.chmodSync(dbPath, 0o600); } catch { /* best effort on non POSIX systems */ }
  }
  db.exec('PRAGMA secure_delete = ON;');
  db.exec(SCHEMA);
  const count = db.prepare('SELECT COUNT(*) AS n FROM clinics').get().n;
  if (count === 0) {
    const ins = db.prepare('INSERT INTO clinics (name, kind, district, phone, services, lat, lng, is_sample, created_at) VALUES (?,?,?,?,?,?,?,1,?)');
    const now = new Date().toISOString();
    for (const c of SAMPLE_CLINICS) ins.run(c[0], c[1], c[2], c[3], c[4], c[5], c[6], now);
  }
  return db;
}

// Run fn inside a transaction.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  }
}
