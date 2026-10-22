import http from 'node:http';
import { loadConfig } from './src/config.js';
import { openDb } from './src/db.js';
import { createApp } from './src/app.js';
import { ensureAdmin } from './src/auth.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`PashuMitra AI needs Node.js 22.13 or newer (found ${process.versions.node}). Download the current LTS from https://nodejs.org`);
  process.exit(1);
}

let cfg;
try { cfg = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }

const db = openDb(cfg.dbPath);
await ensureAdmin(db, cfg);
const app = createApp(cfg, db);

const server = http.createServer(app.handler);
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 60;
server.on('clientError', (err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });

server.listen(cfg.port, cfg.host, () => {
  console.log(`PashuMitra AI is running at http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`);
});

function shutdown() {
  server.close(() => { app.close(); try { db.close(); } catch { /* already closed */ } process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e && e.message ? e.message : e));
