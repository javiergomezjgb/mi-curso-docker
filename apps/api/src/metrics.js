'use strict';
// Métricas Prometheus mínimas (formato texto) sin dependencias.
// Exporta las dos métricas que pide el Día 4: http_requests_total y
// http_request_duration_seconds (histograma).
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

const counters = new Map();   // clave "method|route|status" -> número
const histos = new Map();     // clave "method|route" -> { buckets[], sum, count }

function observe(method, route, status, seconds) {
  const ck = `${method}|${route}|${status}`;
  counters.set(ck, (counters.get(ck) || 0) + 1);
  const hk = `${method}|${route}`;
  let h = histos.get(hk);
  if (!h) { h = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }; histos.set(hk, h); }
  BUCKETS.forEach((b, i) => { if (seconds <= b) h.buckets[i] += 1; });
  h.sum += seconds;
  h.count += 1;
}

function render() {
  const lines = [];
  lines.push('# HELP http_requests_total Total de peticiones HTTP');
  lines.push('# TYPE http_requests_total counter');
  for (const [k, v] of counters) {
    const [method, route, status] = k.split('|');
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${v}`);
  }
  lines.push('# HELP http_request_duration_seconds Duración de las peticiones HTTP');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const [k, h] of histos) {
    const [method, route] = k.split('|');
    const l = `method="${method}",route="${route}"`;
    BUCKETS.forEach((b, i) => lines.push(`http_request_duration_seconds_bucket{${l},le="${b}"} ${h.buckets[i]}`));
    lines.push(`http_request_duration_seconds_bucket{${l},le="+Inf"} ${h.count}`);
    lines.push(`http_request_duration_seconds_sum{${l}} ${h.sum}`);
    lines.push(`http_request_duration_seconds_count{${l}} ${h.count}`);
  }
  lines.push('# HELP process_uptime_seconds Segundos desde el arranque');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${process.uptime()}`);
  return lines.join('\n') + '\n';
}

module.exports = { observe, render };
