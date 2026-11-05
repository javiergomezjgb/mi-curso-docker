# Makefile del curso (versión acumulada hasta el Día 3)
# Uso: make help
# Las variables se leen de .env (OWNER, VERSION...). Copia .env.example a .env y rellénalo.
-include .env
export

REGISTRY  ?= ghcr.io
OWNER     ?= $(shell git config --get remote.origin.url 2>/dev/null | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#' | tr 'A-Z' 'a-z')
VERSION   ?= v1.0.0
REPO      ?= mi-curso-docker
# Enlaza cada imagen con el repositorio de GitHub: así el pipeline (GITHUB_TOKEN) puede publicar en esos paquetes
SOURCE_LABEL = --label org.opencontainers.image.source=https://github.com/$(OWNER)/$(REPO)
GIT_SHA   := $(shell git rev-parse --short HEAD 2>/dev/null || echo dev)
SERVICES  := frontend api worker
PLATFORMS ?= linux/amd64,linux/arm64
COMPOSE_PROD := docker compose -f docker-compose.yml -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help check-owner build test lint buildx-setup push scan dive \
        compose-up compose-down compose-down-v compose-logs compose-ps compose-build compose-prod compose-prod-down \
        ci-lint ci-test ci-build ci-scan ci-sbom ci-sign ci-all

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

check-owner:
	@test -n "$(OWNER)" || { echo "Falta OWNER: ponlo en .env (tu usuario de GitHub en minúsculas)"; exit 1; }

## ---------- Día 1: imágenes ----------
build: check-owner ## Construye las 3 imágenes para tu arquitectura
	@for s in $(SERVICES); do \
	  echo "==> build $$s"; \
	  docker build --build-arg APP_VERSION=$(VERSION) $(SOURCE_LABEL) \
	    -t $(REGISTRY)/$(OWNER)/$$s:$(VERSION) -t $(REGISTRY)/$(OWNER)/$$s:latest apps/$$s || exit 1; \
	done

test: check-owner ## Ejecuta los tests (stage builder) y un smoke test de la API
	@for s in $(SERVICES); do echo "==> tests $$s"; docker build --target builder -q -t test-$$s apps/$$s >/dev/null || exit 1; done
	@docker rm -f smoke-api >/dev/null 2>&1 || true
	@docker run -d --name smoke-api -p 3999:3000 $(REGISTRY)/$(OWNER)/api:$(VERSION) >/dev/null
	@sleep 3; curl -fsS http://localhost:3999/healthz && echo "  <- smoke test API OK"; \
	 rc=$$?; docker rm -f smoke-api >/dev/null; exit $$rc

lint: ## hadolint sobre los 3 Dockerfiles (0 avisos)
	hadolint apps/frontend/Dockerfile apps/api/Dockerfile apps/worker/Dockerfile

buildx-setup: ## Crea el builder "multiarch" y registra QEMU para arm64
	docker run --privileged --rm tonistiigi/binfmt --install arm64
	docker buildx inspect multiarch >/dev/null 2>&1 || docker buildx create --name multiarch --driver docker-container
	docker buildx use multiarch
	docker buildx inspect --bootstrap

push: check-owner ## Build multi-arch (amd64+arm64) y push a GHCR con tags vX.Y.Z, sha-xxxx y latest
	@for s in $(SERVICES); do \
	  echo "==> push $$s"; \
	  docker buildx build --builder multiarch --platform $(PLATFORMS) --build-arg APP_VERSION=$(VERSION) $(SOURCE_LABEL) \
	    -t $(REGISTRY)/$(OWNER)/$$s:$(VERSION) -t $(REGISTRY)/$(OWNER)/$$s:sha-$(GIT_SHA) -t $(REGISTRY)/$(OWNER)/$$s:latest \
	    --push apps/$$s || exit 1; \
	done

scan: check-owner ## Trivy: falla si hay vulnerabilidades HIGH/CRITICAL con parche disponible
	@for s in $(SERVICES); do \
	  echo "==> trivy $$s"; \
	  trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 $(REGISTRY)/$(OWNER)/$$s:$(VERSION) || exit 1; \
	done

dive: check-owner ## dive en modo CI: eficiencia mínima del 90 %
	@for s in $(SERVICES); do \
	  echo "==> dive $$s"; \
	  CI=true dive --ci --lowestEfficiency=0.9 $(REGISTRY)/$(OWNER)/$$s:$(VERSION) || exit 1; \
	done

## ---------- Día 2: Compose ----------
compose-build: ## Construye las imágenes con Compose
	docker compose build

compose-up: ## Levanta el stack (base + override de desarrollo)
	docker compose up -d

compose-down: ## Para el stack (conserva los volúmenes)
	docker compose down

compose-down-v: ## Para el stack y BORRA los volúmenes (datos)
	docker compose down -v

compose-logs: ## Sigue los logs de todos los servicios
	docker compose logs -f

compose-ps: ## Estado y salud de los servicios
	docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

compose-prod: ## Despliega en Swarm con base + prod (genera docker-compose.resolved.yml)
	$(COMPOSE_PROD) config > docker-compose.resolved.yml
	@# Errata del curso: "docker stack deploy" no acepta tal cual la salida de "compose config".
	@# Se quita "name", depends_on pasa a lista, cpus a texto y los puertos publicados a número.
	yq -i 'del(.name) | (.services[] | select(has("depends_on")) | .depends_on) |= keys | (.. | select(has("cpus")) | .cpus) |= tostring | (.services[].ports[]? | .published) |= (. | tonumber)' docker-compose.resolved.yml
	docker stack deploy --with-registry-auth -c docker-compose.resolved.yml curso-prod

compose-prod-down: ## Elimina el stack de Swarm
	docker stack rm curso-prod

## ---------- Día 3: seguridad y CI ----------
ci-lint: lint ## Lint de Dockerfiles y YAML
	@command -v yamllint >/dev/null && yamllint -d relaxed docker-compose*.yml .github/workflows/*.yml || echo "(yamllint no instalado, se omite)"

ci-test: test ## Tests (alias del pipeline)

ci-build: buildx-setup push ## Build multi-arch y push

ci-scan: scan ## Escaneo de vulnerabilidades

ci-sbom: check-owner ## SBOM SPDX y CycloneDX con Syft
	@for s in $(SERVICES); do \
	  syft $(REGISTRY)/$(OWNER)/$$s:$(VERSION) -o spdx-json=sbom-$$s.spdx.json -o cyclonedx-json=sbom-$$s.cdx.json || exit 1; \
	done; ls -1 sbom-*

ci-sign: check-owner ## Firma las imágenes con cosign (clave local cosign.key)
	@test -f cosign.key || { echo "Genera la clave antes: cosign generate-key-pair"; exit 1; }
	@for s in $(SERVICES); do \
	  d=$$(docker buildx imagetools inspect $(REGISTRY)/$(OWNER)/$$s:$(VERSION) --format '{{json .Manifest.Digest}}' | tr -d '"'); \
	  cosign sign --yes --key cosign.key $(REGISTRY)/$(OWNER)/$$s@$$d || exit 1; \
	done

ci-all: ci-lint ci-test ci-build ci-scan ci-sbom ci-sign ## Pipeline completo en local
