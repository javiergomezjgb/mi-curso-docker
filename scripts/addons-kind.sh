#!/usr/bin/env bash
# Añade a un clúster kind lo que el curso da por hecho y no instala (errata del Día 4):
#  - ingress-nginx (sin él, los Ingress no funcionan)
#  - metrics-server (sin él, el HPA y "kubectl top" no funcionan)
# Ejecútalo DESPUÉS de "kind create cluster --name curso-k8s --config .github/kind-config.yaml".
set -euo pipefail
CTX=${1:-kind-curso-k8s}

echo "==> ingress-nginx (manifiesto para kind)"
kubectl --context "$CTX" apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl --context "$CTX" -n ingress-nginx wait --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=180s

echo "==> metrics-server (con --kubelet-insecure-tls, necesario en kind)"
kubectl --context "$CTX" apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl --context "$CTX" -n kube-system patch deployment metrics-server --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl --context "$CTX" -n kube-system rollout status deployment metrics-server --timeout=180s

echo "==> Comprobación"
kubectl --context "$CTX" get pods -n ingress-nginx
sleep 20; kubectl --context "$CTX" top nodes || echo "(las métricas tardan ~1 minuto en aparecer; repite: kubectl top nodes)"
