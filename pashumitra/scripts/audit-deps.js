// The app has no third-party packages. This checks that this stays true, and runs npm audit when a lockfile exists.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
if (deps.length) {
  console.log('Dependencies declared: ' + deps.join(', '));
  if (fs.existsSync(path.join(root, 'package-lock.json'))) {
    try { execSync('npm audit --omit=dev', { cwd: root, stdio: 'inherit' }); } catch { process.exit(1); }
  } else { console.error('Dependencies exist but there is no package-lock.json. Run npm install first.'); process.exit(1); }
} else {
  console.log('Zero third-party dependencies, so there are no known vulnerable or unused packages.');
  console.log('Runtime: Node ' + process.versions.node + ' (needs 22.13 or newer; use the current LTS for security patches).');
}
