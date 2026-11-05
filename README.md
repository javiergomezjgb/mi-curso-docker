# mi-curso-docker

[![CI](https://github.com/javiergomezjgb/mi-curso-docker/actions/workflows/ci.yml/badge.svg)](https://github.com/javiergomezjgb/mi-curso-docker/actions/workflows/ci.yml)

Repositorio personal de laboratorios del Curso Docker de Agile611.

## Arquitectura

| Servicio | Tecnología | Puerto | Función |
| --- | --- | --- | --- |
| frontend | Nginx sin root (estáticos) | 8080 | Interfaz web; `/api` hace de proxy a la API |
| api | Node.js 22 (sin dependencias) | 3000 | `/healthz`, `/readyz`, `/api/health`, `/api/jobs`, `/metrics` |
| worker | Python 3.12 (sin dependencias) | 9100 | Consume la cola `jobs` de Redis; `/metrics` |
| db | PostgreSQL 16 | 5432 | Datos (volumen `pgdata`) |
| redis | Redis 7 | 6379 | Cola de trabajos (volumen `redisdata`) |

## Uso rápido

```bash
cp .env.example .env            # pon tu usuario de GitHub en OWNER
make help                       # lista de objetivos
make build test                 # Día 1: imágenes y tests
make compose-up                 # Día 2: stack de desarrollo
make ci-all                     # Día 3: pipeline completo en local
```

Imágenes: `ghcr.io/javiergomezjgb/{frontend,api,worker}` con tags `vX.Y.Z`, `sha-xxxxxxx` y `latest`.
