'use strict';
// Cliente Redis mínimo (protocolo RESP) sin dependencias externas.
// Abre una conexión por comando: suficiente para los laboratorios del curso.
const net = require('node:net');

function encode(args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) {
    const s = String(a);
    out += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return out;
}

// Devuelve [valor, bytesConsumidos] o null si faltan datos.
function parse(buf, offset = 0) {
  if (buf.length <= offset) return null;
  const type = String.fromCharCode(buf[offset]);
  const end = buf.indexOf('\r\n', offset);
  if (end === -1) return null;
  const line = buf.toString('utf8', offset + 1, end);
  const next = end + 2;
  switch (type) {
    case '+': return [line, next];
    case '-': return [new Error(line), next];
    case ':': return [Number(line), next];
    case '$': {
      const len = Number(line);
      if (len === -1) return [null, next];
      if (buf.length < next + len + 2) return null;
      return [buf.toString('utf8', next, next + len), next + len + 2];
    }
    case '*': {
      const n = Number(line);
      if (n === -1) return [null, next];
      const items = [];
      let pos = next;
      for (let i = 0; i < n; i++) {
        const r = parse(buf, pos);
        if (!r) return null;
        items.push(r[0]);
        pos = r[1];
      }
      return [items, pos];
    }
    default:
      throw new Error(`Respuesta RESP desconocida: ${type}`);
  }
}

function command(url, args, timeoutMs = 2000) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: u.hostname, port: Number(u.port || 6379) });
    let buf = Buffer.alloc(0);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('Timeout de Redis')); }, timeoutMs);
    socket.on('connect', () => socket.write(encode(args)));
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const r = parse(buf);
      if (r) {
        clearTimeout(timer);
        socket.end();
        if (r[0] instanceof Error) reject(r[0]); else resolve(r[0]);
      }
    });
    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

module.exports = { encode, parse, command };
