"""Worker del laboratorio: Python 3.12 sin dependencias externas.

Consume trabajos de la lista "jobs" de Redis (BLPOP), cuenta los procesados en
"jobs:processed" y expone en el puerto 9100:
  /healthz  -> 200 si el bucle está vivo
  /metrics  -> métricas Prometheus (worker_jobs_processed_total, worker_errors_total)
Escribe un latido en /tmp/heartbeat que usa el HEALTHCHECK del contenedor.
"""
import json
import os
import signal
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379")
METRICS_PORT = int(os.environ.get("METRICS_PORT", "9100"))
HEARTBEAT = os.environ.get("HEARTBEAT_FILE", "/tmp/heartbeat")

stats = {"processed": 0, "errors": 0}
running = True


def log(level, msg, **extra):
    print(json.dumps({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "level": level,
                      "service": "worker", "msg": msg, **extra}), flush=True)


def encode(*args):
    out = f"*{len(args)}\r\n"
    for a in args:
        s = str(a)
        out += f"${len(s.encode())}\r\n{s}\r\n"
    return out.encode()


def parse(buf, pos=0):
    """Devuelve (valor, nueva_posicion) o None si faltan datos."""
    if len(buf) <= pos:
        return None
    end = buf.find(b"\r\n", pos)
    if end == -1:
        return None
    kind, line, nxt = chr(buf[pos]), buf[pos + 1:end].decode(), end + 2
    if kind == "+":
        return line, nxt
    if kind == "-":
        return RuntimeError(line), nxt
    if kind == ":":
        return int(line), nxt
    if kind == "$":
        n = int(line)
        if n == -1:
            return None, nxt
        if len(buf) < nxt + n + 2:
            return None
        return buf[nxt:nxt + n].decode(), nxt + n + 2
    if kind == "*":
        n = int(line)
        if n == -1:
            return None, nxt
        items = []
        for _ in range(n):
            r = parse(buf, nxt)
            if r is None:
                return None
            items.append(r[0])
            nxt = r[1]
        return items, nxt
    raise ValueError(f"respuesta RESP desconocida: {kind}")


def command(*args, timeout=10):
    u = urlparse(REDIS_URL)
    with socket.create_connection((u.hostname, u.port or 6379), timeout=timeout) as s:
        s.sendall(encode(*args))
        buf = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                raise ConnectionError("Redis cerró la conexión")
            buf += chunk
            r = parse(buf)
            if r is not None:
                if isinstance(r[0], RuntimeError):
                    raise r[0]
                return r[0]


def beat():
    with open(HEARTBEAT, "w", encoding="utf-8") as f:
        f.write(str(time.time()))


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (nombre impuesto por http.server)
        if self.path == "/healthz":
            body, ctype = b"ok\n", "text/plain"
        elif self.path == "/metrics":
            body = (
                "# HELP worker_jobs_processed_total Trabajos procesados\n"
                "# TYPE worker_jobs_processed_total counter\n"
                f"worker_jobs_processed_total {stats['processed']}\n"
                "# HELP worker_errors_total Errores del bucle\n"
                "# TYPE worker_errors_total counter\n"
                f"worker_errors_total {stats['errors']}\n"
            ).encode()
            ctype = "text/plain; version=0.0.4"
        else:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # silencia el log por petición
        pass


def stop(signum, _frame):
    global running
    log("info", f"recibida señal {signum}, terminando")
    running = False


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    server = ThreadingHTTPServer(("0.0.0.0", METRICS_PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log("info", "worker arrancado", redis=REDIS_URL, metrics_port=METRICS_PORT)
    while running:
        beat()
        try:
            item = command("BLPOP", "jobs", 5)
            if item:
                job = json.loads(item[1])
                time.sleep(0.1)  # simula trabajo
                command("INCR", "jobs:processed")
                stats["processed"] += 1
                log("info", "trabajo procesado", job_id=job.get("id"))
        except (OSError, RuntimeError, ValueError) as err:
            stats["errors"] += 1
            log("error", "fallo en el bucle", error=str(err))
            time.sleep(2)
    server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
