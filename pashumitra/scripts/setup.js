// Creates .env with fresh random secrets on first run. Never overwrites an existing file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const dataDir = path.join(root, 'data');

fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

if (!fs.existsSync(envPath)) {
  const secret = crypto.randomBytes(48).toString('base64url');
  const adminPassword = crypto.randomBytes(12).toString('base64url') + 'a9';
  const body = [
    'NODE_ENV=production',
    'HOST=127.0.0.1',
    'PORT=3000',
    `SESSION_SECRET=${secret}`,
    'SESSION_HOURS=8',
    'COOKIE_SECURE=false',
    'CORS_ORIGINS=',
    'TRUST_PROXY=0',
    'DB_PATH=data/pashumitra.db',
    'ADMIN_EMAIL=admin@pashumitra.local',
    `ADMIN_PASSWORD=${adminPassword}`,
    ''
  ].join('\n');
  fs.writeFileSync(envPath, body, { mode: 0o600 });
  console.log('');
  console.log('First run: created .env with new random secrets (file mode 600).');
  console.log('Admin sign in:  admin@pashumitra.local');
  console.log('Admin password: ' + adminPassword);
  console.log('Change this password after signing in, then delete ADMIN_PASSWORD from .env.');
  console.log('');
}
