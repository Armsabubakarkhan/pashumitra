import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Small .env reader so no dependency is needed. Real environment variables win.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

function intVar(env, name, def, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

export function loadConfig(overrides = {}) {
  if (!overrides.skipEnvFile) loadEnvFile(path.join(ROOT, process.env.ENV_FILE || '.env'));
  const env = { ...process.env, ...overrides };
  const problems = [];
  const cfg = {};

  cfg.nodeEnv = env.NODE_ENV === 'development' ? 'development' : env.NODE_ENV === 'test' ? 'test' : 'production';
  cfg.host = env.HOST || '127.0.0.1';
  try { cfg.port = intVar(env, 'PORT', 3000, 0, 65535); } catch (e) { problems.push(e.message); }
  try { cfg.sessionHours = intVar(env, 'SESSION_HOURS', 8, 1, 168); } catch (e) { problems.push(e.message); }
  try { cfg.trustProxy = intVar(env, 'TRUST_PROXY', 0, 0, 5); } catch (e) { problems.push(e.message); }

  cfg.sessionSecret = env.SESSION_SECRET || '';
  if (cfg.sessionSecret.length < 32) problems.push('SESSION_SECRET is missing or shorter than 32 characters. Run "npm run setup" on a fresh checkout, or set a long random value.');

  cfg.cookieSecure = String(env.COOKIE_SECURE).toLowerCase() === 'true';
  cfg.corsOrigins = (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const o of cfg.corsOrigins) {
    try { const u = new URL(o); if (!['http:', 'https:'].includes(u.protocol) || u.origin !== o) throw 0; }
    catch { problems.push(`CORS_ORIGINS entry "${o}" must look like https://example.com with no path or trailing slash`); }
  }
  if (cfg.corsOrigins.includes('*')) problems.push('CORS_ORIGINS must not contain *');

  const dbPath = env.DB_PATH || 'data/pashumitra.db';
  cfg.dbPath = dbPath === ':memory:' ? dbPath : path.resolve(ROOT, dbPath);
  cfg.adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  cfg.adminPassword = env.ADMIN_PASSWORD || '';
  cfg.publicDir = path.join(ROOT, 'public');
  cfg.rateLimitEnabled = env.RATE_LIMIT !== 'off';

  if (problems.length) {
    const err = new Error('Configuration problems:\n - ' + problems.join('\n - '));
    err.isConfig = true;
    throw err;
  }
  return cfg;
}
