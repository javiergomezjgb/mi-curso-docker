# syntax=docker/dockerfile:1.7
# API (Node.js) · Dockerfile multi-stage del Día 1, con las erratas del curso corregidas:
#  - en el builder se instalan TODAS las dependencias (no --only=production) y se podan al final
#  - los comentarios van siempre en su propia línea (nunca detrás de una instrucción)
#  - runtime distroless: sin shell ni npm, menos CVE para el escaneo del Día 3

# ---------- Etapa 1: builder (dependencias + build + tests) ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
# Primero solo los manifiestos: esta capa se reutiliza de la caché si no cambian las dependencias
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
# Después el código, que cambia en cada commit
COPY . .
# Build, tests y poda de dependencias de desarrollo; mkdir por si no queda ninguna dependencia
RUN npm run build && npm test && npm prune --omit=dev && mkdir -p node_modules

# ---------- Etapa 2: runtime mínimo ----------
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="api" \
      org.opencontainers.image.description="API del laboratorio del Curso Docker" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=builder --chown=1001:1001 /app/package.json ./
COPY --from=builder --chown=1001:1001 /app/node_modules ./node_modules
COPY --from=builder --chown=1001:1001 /app/dist ./dist
# Usuario no root: el validador del curso exige exactamente "1001" o "appuser"
USER 1001
EXPOSE 3000
# Forma exec: distroless no tiene shell ni wget/curl, así que se usa el propio Node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('http').get('http://127.0.0.1:3000/healthz', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
# La imagen distroless ya tiene ENTRYPOINT ["/nodejs/bin/node"]; CMD es el script
CMD ["dist/server.js"]
