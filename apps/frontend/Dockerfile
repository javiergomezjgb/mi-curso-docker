# syntax=docker/dockerfile:1.7
# Frontend · Dockerfile multi-stage del Día 1, con las erratas del curso corregidas:
#  - Nginx sin root (nginx-unprivileged) escuchando en 8080: el nginx normal no arranca sin root
#  - healthcheck en forma exec

# ---------- Etapa 1: builder ----------
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build && npm test

# ---------- Etapa 2: runtime ----------
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="frontend" \
      org.opencontainers.image.description="Frontend del laboratorio del Curso Docker" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
# La imagen base ya usa el usuario nginx (UID 101); se declara para que quede explícito
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
