'use strict';
// "Build" del frontend: copia los estáticos de src/ a dist/ (el papel de "vite build" en el curso).
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src');
const dist = path.join(__dirname, '..', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true });
console.log(`frontend construido en ${dist}`);
