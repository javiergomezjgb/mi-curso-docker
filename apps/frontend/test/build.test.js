'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('el build genera index.html y app.js', () => {
  const dist = path.join(__dirname, '..', 'dist');
  for (const f of ['index.html', 'app.js', 'styles.css']) {
    assert.ok(fs.existsSync(path.join(dist, f)), `falta ${f}`);
  }
});

test('nginx.conf escucha en 8080 y expone /healthz', () => {
  const conf = fs.readFileSync(path.join(__dirname, '..', 'nginx.conf'), 'utf8');
  assert.match(conf, /listen\s+8080/);
  assert.match(conf, /location = \/healthz/);
});
