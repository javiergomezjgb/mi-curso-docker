# syntax=docker/dockerfile:1.7
# Worker (Python 3.12) · Dockerfile multi-stage del Día 1, con las erratas del curso corregidas:
#  - builder y runtime de la MISMA familia (Alpine con Alpine): el curso compila en Alpine (musl)
#    y copia a distroless Debian (glibc), y los paquetes compilados no funcionarían

# ---------- Etapa 1: builder (dependencias + tests) ----------
FROM python:3.12-alpine AS builder
WORKDIR /app
COPY requirements.txt ./
RUN mkdir -p /install && pip install --no-cache-dir --prefix=/install -r requirements.txt
COPY . .
RUN python -m unittest discover -s tests && python -m compileall -q worker.py

# ---------- Etapa 2: runtime ----------
FROM python:3.12-alpine AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="worker" \
      org.opencontainers.image.description="Worker del laboratorio del Curso Docker" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S -u 1001 -G appgroup appuser
COPY --from=builder /install /usr/local
COPY --from=builder --chown=1001:1001 /app/worker.py ./
USER 1001
EXPOSE 9100
# El worker escribe un latido en /tmp/heartbeat en cada vuelta del bucle
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os, sys, time; sys.exit(0 if time.time() - os.path.getmtime('/tmp/heartbeat') < 30 else 1)"]
CMD ["python", "worker.py"]
