# Kubernetes deployment — api-registry

Manifest ready-to-apply untuk deploy api-registry di K8s cluster
(target: v1.24+).

## Struktur

```
deploy/kubernetes/
├── 00-namespace.yaml         # Namespace webbuilder
├── 10-configmap.yaml         # Non-sensitive config
├── 20-secret.yaml            # TEMPLATE — jangan commit dengan value asli
├── 30-deployment.yaml        # Deployment (2 replica, resource limits)
├── 40-service.yaml           # ClusterIP internal
├── 50-webhook-ingress.yaml   # Public path /webhooks/registrar only
├── 60-hpa.yaml               # HorizontalPodAutoscaler
├── 70-pdb.yaml               # PodDisruptionBudget
└── 80-networkpolicy.yaml     # Zero-trust intra-cluster policy
```

## Setup pertama kali

```bash
# 1. Namespace
kubectl apply -f 00-namespace.yaml

# 2. Config
kubectl apply -f 10-configmap.yaml

# 3. Secret — JANGAN pakai 20-secret.yaml apa adanya!
cp 20-secret.yaml 20-secret.local.yaml
# Edit 20-secret.local.yaml, isi credentials asli, apply.
kubectl apply -f 20-secret.local.yaml

# 4. Deploy + service
kubectl apply -f 30-deployment.yaml
kubectl apply -f 40-service.yaml

# 5. Autoscale + disruption
kubectl apply -f 60-hpa.yaml
kubectl apply -f 70-pdb.yaml

# 6. Public webhook ingress (kalau butuh terima dari registrar)
# GANTI host di 50-webhook-ingress.yaml sebelum apply.
kubectl apply -f 50-webhook-ingress.yaml

# 7. Network policy (butuh CNI seperti Calico/Cilium)
kubectl apply -f 80-networkpolicy.yaml

# Verify
kubectl -n webbuilder get pods -l app.kubernetes.io/name=api-registry
kubectl -n webbuilder port-forward svc/api-registry 5000:5000 &
curl http://localhost:5000/healthz
```

## Sensitive data — bukan hardcode di git

Opsi pengamanan Secret (pilih 1):

**A. sealed-secrets** (bitnami/sealed-secrets)

```bash
kubeseal --format=yaml < 20-secret.local.yaml > 20-sealed-secret.yaml
# Aman commit 20-sealed-secret.yaml ke git
kubectl apply -f 20-sealed-secret.yaml
```

**B. external-secrets + Vault/AWS Secrets Manager**

Buat `ExternalSecret` resource yang sync dari backend eksternal ke
K8s Secret. api-registry Deployment cukup reference secretRef.

**C. sops + git-crypt** — encrypt file sebelum commit.

## Upgrade / rollout

```bash
# Bump image tag di 30-deployment.yaml, apply.
kubectl apply -f 30-deployment.yaml

# Monitor rollout (RollingUpdate maxSurge=1, maxUnavailable=0 = zero-downtime).
kubectl -n webbuilder rollout status deployment/api-registry

# Rollback kalau error.
kubectl -n webbuilder rollout undo deployment/api-registry
```

## Scaling notes

- **Fase 1a** (in-memory jobs): cap `maxReplicas: 2`. Job audit trail
  bocor antar replica — user yang list job cuma lihat yang di-handle
  replica yang sama. Untuk MVP acceptable.
- **Fase 2** (Redis-backed jobs): boleh naikkan `maxReplicas` ke 5-10.
  Update `60-hpa.yaml` + verify job store impl.

## Observability

- **Prometheus**: annotation `prometheus.io/scrape` di Deployment sudah
  set — kube-prometheus-stack auto-discover. Manual:
  ```bash
  kubectl -n webbuilder port-forward svc/api-registry 5000:5000
  curl http://localhost:5000/metrics
  ```
- **Grafana dashboard**: import JSON dari
  [`../grafana-dashboard.json`](../grafana-dashboard.json) (belum
  di-generate — Fase 1b).
- **Logs**: JSON structured stdout — pipe ke Loki/CloudWatch/Datadog.
- **Traces**: OTLP integration belum. Fase 2 kalau butuh cross-service
  trace correlation.

## Health probe reference

| Endpoint | Purpose | Response |
|---|---|---|
| `/healthz` | Liveness (proc + provider) | 200 kalau proc up |
| `/readyz` | Readiness (upstream probe) | 200 kalau registrar-api reachable, 503 kalau tidak |
| `/version` | Deploy verification | 200 dengan version + commit + build_time |
| `/metrics` | Prometheus | text exposition |
| `/openapi.json` | API contract | OpenAPI 3.1 JSON |

## Troubleshooting

**Pod restart loop di startupProbe** — cek log `kubectl logs`:
- `PANDI_API_URL kosong` → tambah value di ConfigMap
- `PANDI_API_KEY atau (PANDI_EMAIL + PANDI_PASSWORD) wajib` → Secret belum applied
- Panic saat init → cek error message + build image ulang

**503 di /readyz konstan** — upstream registrar-api unreachable. Cek:
```bash
kubectl -n webbuilder exec deploy/api-registry -- \
  wget -qO- --tries=1 --timeout=5 https://api.pandi.id/v1/api/whois?domain=example.id
```

**HMAC signature mismatch di client call** — verify `INTERNAL_HMAC_SECRET`
di api-registry Secret === `API_REGISTRY_HMAC_SECRET` di web builder API
Deployment.

**Circuit breaker open terus** — cek metric
`api_registry_circuit_open_total`. Kalau spam, cek log warn dan reset:
```bash
kubectl -n webbuilder rollout restart deployment/api-registry
```
(restart bikin state fresh — closed default).
