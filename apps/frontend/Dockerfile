# syntax=docker/dockerfile:1.7
# Frontend · Dockerfile multi-stage del Día 1, con las erratas del curso corregidas:
#  - Nginx sin root (nginx-unprivileged) escuchando en 8080: el nginx normal no arranca sin root
#  - healthcheck en forma exec
#  - imagen final aplanada en una sola capa: la base de nginx duplica OpenSSL entre sus capas
#    y dive daba un 89 % de eficiencia (el entregable pide > 90 %)

# ---------- Etapa 1: builder ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm test

# ---------- Etapa 2: nginx con nuestra configuración y estáticos ----------
FROM nginxinc/nginx-unprivileged:stable-alpine AS nginx-base
# Parche de la base: la imagen oficial aún no trae las versiones de Alpine que corrigen CVE HIGH/CRITICAL.
USER 0
# hadolint ignore=DL3017
RUN apk upgrade --no-cache
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# ---------- Etapa 3: runtime aplanado (una sola capa, sin bytes desperdiciados) ----------
FROM scratch AS runtime
# Excepción documentada: copiar el sistema de ficheros completo es justo el objetivo (aplanar)
# hadolint ignore=DL3067
COPY --from=nginx-base / /
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="frontend" \
      org.opencontainers.image.description="Frontend del laboratorio del Curso Docker" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"
# Al partir de scratch se pierden los metadatos de la imagen base: se declaran de nuevo
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER 101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
