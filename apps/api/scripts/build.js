'use strict';
// "Compila" la API: comprueba la sintaxis de cada fichero y lo copia a dist/.
// Hace el papel del paso de compilación (TypeScript en el curso) del stage builder.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const src = path.join(__dirname, '..', 'src');
const dist = path.join(__dirname, '..', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith('.js')) continue;
  execFileSync(process.execPath, ['--check', path.join(src, f)]);
  fs.copyFileSync(path.join(src, f), path.join(dist, f));
  console.log(`ok ${f}`);
}
