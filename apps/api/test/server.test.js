'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../src/server');
const { encode, parse } = require('../src/redis');

// Redis y la base de datos no existen durante el build: apuntamos a puertos cerrados.
process.env.REDIS_URL = 'redis://127.0.0.1:1';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';

function start() {
  return new Promise((resolve) => {
    const server = createServer().listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('GET /healthz responde 200', async () => {
  const server = await start();
  const res = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
  assert.strictEqual(res.status, 200);
  server.close();
});

test('GET /readyz responde 503 si no hay dependencias', async () => {
  const server = await start();
  const res = await fetch(`http://127.0.0.1:${server.address().port}/readyz`);
  assert.strictEqual(res.status, 503);
  server.close();
});

test('GET /metrics expone http_requests_total', async () => {
  const server = await start();
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(`${base}/healthz`);
  const body = await (await fetch(`${base}/metrics`)).text();
  assert.match(body, /http_requests_total\{method="GET",route="\/healthz",status="200"\} \d+/);
  assert.match(body, /http_request_duration_seconds_bucket/);
  server.close();
});

test('RESP: codifica y decodifica', () => {
  assert.strictEqual(encode(['PING']), '*1\r\n$4\r\nPING\r\n');
  assert.deepStrictEqual(parse(Buffer.from('+PONG\r\n'))[0], 'PONG');
  assert.deepStrictEqual(parse(Buffer.from('*2\r\n$4\r\njobs\r\n$2\r\nhi\r\n'))[0], ['jobs', 'hi']);
  assert.strictEqual(parse(Buffer.from(':5\r\n'))[0], 5);
});
