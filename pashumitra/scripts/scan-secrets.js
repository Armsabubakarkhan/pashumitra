// Scans tracked and untracked project files (and git history when present) for leaked secrets.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'data']);
const SKIP_FILES = new Set(['.env', '.env.e2e']); // local, git-ignored
const RULES = [
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Anthropic or OpenAI style key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Hard-coded secret assignment', /\b(?:secret|api[_-]?key|token|passwd|password)\b\s*[:=]\s*['"][A-Za-z0-9+/_\-]{16,}['"]/i],
  ['Long base64url literal', /['"][A-Za-z0-9_-]{48,}['"]/]
];
// Known safe fixtures used only by the automated tests.
const ALLOW = [/wrong-password-1/, /test-secret-/, /Admin-pass-2026/, /Field-gate-2026/, /Vet-office-2026/, /New-field-gate-27/, /e2e-secret/];

const hits = [];
function scanText(label, text) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 4000) return;
    for (const [name, re] of RULES) if (re.test(line) && !ALLOW.some((a) => a.test(line))) hits.push(`${label}:${i + 1}  ${name}`);
  });
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (!SKIP_FILES.has(e.name) && fs.statSync(p).size < 2_000_000) scanText(path.relative(root, p), fs.readFileSync(p, 'utf8'));
  }
}
walk(root);

let historyNote = 'no git history to scan';
if (fs.existsSync(path.join(root, '.git'))) {
  try {
    const log = execFileSync('git', ['log', '--all', '-p', '--no-color'], { cwd: root, maxBuffer: 200 * 1024 * 1024 }).toString();
    const added = log.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
    const before = hits.length;
    scanText('git-history', added);
    historyNote = `git history scanned, ${hits.length - before} finding(s)`;
    const tracked = execFileSync('git', ['ls-files'], { cwd: root }).toString().split('\n');
    for (const f of tracked) if (/(^|\/)\.env($|\.)/.test(f) && f !== '.env.example') hits.push(`${f}  env file is tracked by git`);
  } catch (e) { historyNote = 'git history could not be read: ' + e.message; }
}

if (hits.length) { console.error('Possible secrets found:\n' + hits.map((h) => ' - ' + h).join('\n')); process.exit(1); }
console.log('No secrets found (' + historyNote + ').');
