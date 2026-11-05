'use strict';
// API del laboratorio: Node.js sin dependencias externas.
// Rutas:
//   GET  /healthz          liveness: el proceso responde (no mira dependencias)
//   GET  /readyz           readiness: Redis y PostgreSQL alcanzables
//   GET  /api/health       estado detallado en JSON
//   POST /api/jobs         encola un trabajo en Redis (lista "jobs") -> 202
//   GET  /api/jobs/stats   trabajos pendientes y procesados por el worker
//   GET  /metrics          métricas Prometheus
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const redis = require('./redis');
const metrics = require('./metrics');

const PORT = Number(process.env.PORT || 3000);
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const DB_HOST = process.env.DB_HOST || 'db';
const DB_PORT = Number(process.env.DB_PORT || 5432);
const VERSION = process.env.APP_VERSION || 'dev';

// Patrón *_FILE del curso: el secreto se lee de un fichero montado en /run/secrets.
function readSecret(name) {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; }
  }
  return process.env[name] || null;
}

function log(level, msg, extra = {}) {
  process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'api', msg, ...extra }) + '\n');
}

function tcpCheck(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    const t = setTimeout(() => { s.destroy(); resolve(false); }, timeoutMs);
    s.on('connect', () => { clearTimeout(t); s.end(); resolve(true); });
    s.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

async function dependencies() {
  const [redisOk, dbOk] = await Promise.all([
    redis.command(REDIS_URL, ['PING']).then((r) => r === 'PONG').catch(() => false),
    tcpCheck(DB_HOST, DB_PORT),
  ]);
  return { redis: redisOk, db: dbOk };
}

function send(res, status, body, type = 'application/json') {
  const data = type === 'application/json' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type });
  res.end(data);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /healthz':
      return send(res, 200, { status: 'ok' });
    case 'GET /readyz': {
      const deps = await dependencies();
      const ok = deps.redis && deps.db;
      return send(res, ok ? 200 : 503, { status: ok ? 'ready' : 'not-ready', ...deps });
    }
    case 'GET /api/health': {
      const deps = await dependencies();
      return send(res, 200, {
        status: 'ok', version: VERSION, dependencies: deps,
        secrets: { db_password: Boolean(readSecret('DB_PASSWORD')), jwt_secret: Boolean(readSecret('JWT_SECRET')) },
      });
    }
    case 'POST /api/jobs': {
      const job = JSON.stringify({ id: Date.now().toString(36), createdAt: new Date().toISOString() });
      try {
        const pending = await redis.command(REDIS_URL, ['RPUSH', 'jobs', job]);
        log('info', 'trabajo encolado', { pending });
        return send(res, 202, { queued: true, pending });
      } catch (err) {
        log('error', 'no se pudo encolar', { error: err.message });
        return send(res, 503, { queued: false, error: 'redis no disponible' });
      }
    }
    case 'GET /api/jobs/stats': {
      try {
        const [pending, processed] = await Promise.all([
          redis.command(REDIS_URL, ['LLEN', 'jobs']),
          redis.command(REDIS_URL, ['GET', 'jobs:processed']),
        ]);
        return send(res, 200, { pending, processed: Number(processed || 0) });
      } catch {
        return send(res, 503, { error: 'redis no disponible' });
      }
    }
    case 'GET /metrics':
      return send(res, 200, metrics.render(), 'text/plain; version=0.0.4');
    default:
      return send(res, 404, { error: 'no encontrado' });
  }
}

function createServer() {
  return http.createServer((req, res) => {
    const start = process.hrtime.bigint();
    const path = new URL(req.url, 'http://localhost').pathname;
    res.on('finish', () => {
      const secs = Number(process.hrtime.bigint() - start) / 1e9;
      const known = ['/healthz', '/readyz', '/api/health', '/api/jobs', '/api/jobs/stats', '/metrics'];
      metrics.observe(req.method, known.includes(path) ? path : 'other', res.statusCode, secs);
    });
    handle(req, res).catch((err) => {
      log('error', 'error no controlado', { error: err.message });
      if (!res.headersSent) send(res, 500, { error: 'interno' });
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => log('info', `API escuchando en el puerto ${PORT}`, { version: VERSION }));
  // Parada ordenada: Docker envía SIGTERM al PID 1 con "docker stop".
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log('info', `recibido ${sig}, cerrando`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}

module.exports = { createServer, readSecret };
