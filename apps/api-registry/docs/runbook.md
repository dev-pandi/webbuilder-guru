# Runbook — api-registry

Troubleshooting + operational reference untuk on-call engineer.

## Health probes

| Probe | URL | Green | Red |
|---|---|---|---|
| Liveness | `/healthz` | 200 + `ok:true` | Non-200 = pod crash |
| Readiness | `/readyz` | 200 + `ready:true` | 503 = upstream unreachable |
| Version | `/version` | 200 + build info | — |

Grafana panel: track `api_registry_requests_total{path="/readyz",status="503"}`
— alert kalau > 5 dalam 5 menit.

## Key metrics + alert threshold

| Metric | Alert kalau | Meaning |
|---|---|---|
| `api_registry_requests_total{status=~"5.."}` | > 1% dari total 5 min | Server error spike |
| `api_registry_provider_calls_total{result="upstream_error"}` | > 5% dari total 5 min | Upstream flaky |
| `api_registry_circuit_open_total` | > 0 dalam 1 min | Circuit trip — upstream down |
| `api_registry_retry_exhausted_total` | > 10/menit | Retry gagal berulang — cek upstream |
| `api_registry_webhooks_total{result="invalid_signature"}` | > 0 dalam 5 min | Attack / config drift |
| `api_registry_webhooks_total{result="forward_error"}` | > 3 dalam 5 min | Web builder unreachable |
| `api_registry_request_duration_ms_sum / count` per path | avg > 3000ms | Latency degrade |

## Alert playbook

### 🔴 Circuit breaker open

**Symptom**: `api_registry_circuit_open_total > 0`, consumer dapat error
`circuit breaker open — upstream unavailable`.

**Diagnose**:
```bash
# Cek log pod — cari "circuit tripped open"
kubectl -n webbuilder logs -l app.kubernetes.io/name=api-registry --tail=100 | grep circuit

# Test upstream manual
kubectl -n webbuilder exec deploy/api-registry -- \
  wget -qO- --tries=1 --timeout=5 "$PANDI_API_URL/v1/api/whois?domain=example.id"
```

**Actions**:
1. Kalau upstream benar-benar down → tunggu recover (circuit auto half-open
   setelah `CIRCUIT_COOLDOWN_PERIOD`, default 30s).
2. Kalau upstream OK tapi circuit tetap open → mismatch config atau bug,
   restart pod untuk reset state:
   ```bash
   kubectl -n webbuilder rollout restart deploy/api-registry
   ```
3. Kalau chronic (recurring), tune `CIRCUIT_FAILURE_THRESHOLD` naik atau
   `RESILIENCE_ENABLED=false` sementara untuk raw behavior.

### 🔴 Readyz 503 persistent

**Symptom**: `/readyz` return 503, pod ke-mark unready, traffic tidak
di-route ke pod.

**Diagnose**:
```bash
# Cek probe error
kubectl -n webbuilder describe pod -l app.kubernetes.io/name=api-registry

# Manual upstream test
kubectl -n webbuilder exec deploy/api-registry -- \
  curl -si --max-time 5 "$PANDI_API_URL/v1/api/whois?domain=example.id"
```

**Actions**:
1. Verify `PANDI_API_URL` di ConfigMap benar.
2. Verify NetworkPolicy allow egress ke upstream (kalau pakai Calico).
3. Verify DNS resolve dari pod:
   ```bash
   kubectl -n webbuilder exec deploy/api-registry -- nslookup api.pandi.id
   ```
4. Kalau semua OK tapi tetap fail → upstream memang down, halt customer
   registration temporary + notify.

### 🔴 HMAC signature mismatch

**Symptom**: 401 di semua `/v1/*` request dari web builder.

**Diagnose**:
```bash
# Verify secret sama di kedua sisi
kubectl -n webbuilder get secret api-registry-secrets -o jsonpath='{.data.INTERNAL_HMAC_SECRET}' | base64 -d
kubectl -n webbuilder get deploy webbuilder-api -o jsonpath='{.spec.template.spec.containers[0].env}' | jq '.[] | select(.name=="API_REGISTRY_HMAC_SECRET")'
```

**Actions**:
1. Kalau beda → sync secret + rolling restart kedua pod:
   ```bash
   kubectl -n webbuilder rollout restart deploy/api-registry
   kubectl -n webbuilder rollout restart deploy/webbuilder-api
   ```
2. Kalau sama → cek clock drift antar pod (HMAC timestamp fresh window ±5
   menit). Sync NTP.

### 🟡 Retry exhausted spike

**Symptom**: `api_registry_retry_exhausted_total` naik cepat.

**Diagnose**:
```bash
# Log pattern
kubectl -n webbuilder logs deploy/api-registry --tail=200 | grep "retry_exhausted\|circuit"
```

**Actions**:
1. Kalau spike pas upstream maintenance windows → tunggu.
2. Kalau rate constant → naikkan `RETRY_MAX_ATTEMPTS` atau `RETRY_MAX_DELAY`
   di ConfigMap (butuh restart).
3. Kalau chronic → contact upstream vendor.

### 🟡 Webhook forward error

**Symptom**: `api_registry_webhooks_total{result="forward_error"} > 3/5min`.

**Diagnose**:
```bash
kubectl -n webbuilder logs deploy/api-registry --tail=100 | grep "webhook"

# Cek web builder receiver up
kubectl -n webbuilder exec deploy/api-registry -- \
  curl -si --max-time 5 http://webbuilder-api:8080/healthz
```

**Actions**:
1. Kalau web builder down → cek deployment web builder + restart.
2. Kalau reachable tapi 4xx → check payload shape berubah + adjust adapter.
3. Registrar biasanya retry webhook 3-5 kali dalam window — kalau kita fix
   dalam window, no data loss.

### 🟡 Job store memory leak / high memory

**Symptom**: pod OOMKill atau memory usage > 200Mi konstan.

**Diagnose**:
```bash
kubectl -n webbuilder top pod -l app.kubernetes.io/name=api-registry

# Job count via metrics endpoint
kubectl -n webbuilder exec deploy/api-registry -- \
  curl -s http://localhost:5000/v1/jobs?limit=1 | jq '.data.total'
```

**Actions**:
1. In-memory store cap 10k jobs (evict LRU). Kalau tetap OOM → pod
   process traffic > eviction rate. Turunkan `MAX_CONCURRENT` atau
   naikkan resource limit.
2. Fase 2: migrate ke Redis/Postgres backend supaya multi-pod share store.

## Common operations

### Deploy new version

```bash
# 1. Update image tag di 30-deployment.yaml
# 2. Apply
kubectl -n webbuilder apply -f deploy/kubernetes/30-deployment.yaml

# 3. Monitor rollout (zero-downtime: maxSurge=1, maxUnavailable=0)
kubectl -n webbuilder rollout status deploy/api-registry

# 4. Verify version live
kubectl -n webbuilder port-forward svc/api-registry 5000:5000 &
curl -s http://localhost:5000/version | jq
```

### Rollback

```bash
kubectl -n webbuilder rollout undo deploy/api-registry

# Ke revisi spesifik
kubectl -n webbuilder rollout history deploy/api-registry
kubectl -n webbuilder rollout undo deploy/api-registry --to-revision=3
```

### Rotate HMAC secret

Rolling rotation (zero-downtime butuh 2-sided coordination):

1. Generate secret baru: `openssl rand -hex 32`
2. Update `api-registry-secrets` (K8s) dengan value baru sebagai
   `INTERNAL_HMAC_SECRET_NEXT` (tetap keep old sebagai `INTERNAL_HMAC_SECRET`).
3. Deploy — pod support dual-verify (accept lama + baru).
4. Update web builder side pakai `API_REGISTRY_HMAC_SECRET` = new value.
5. Deploy web builder.
6. Setelah rollout selesai + verify 0 error, remove old di api-registry.

**Simpler alternative** (5-menit downtime OK): sync + restart bareng-bareng.

### Force circuit close

Restart pod = clean state.

```bash
kubectl -n webbuilder rollout restart deploy/api-registry
```

Atau via env: `RESILIENCE_ENABLED=false` + apply + revert setelah.

### Debug specific request

Consumer forward `X-Request-ID: <uuid>` di request → api-registry log +
metric label sama ID. Grep log by ID:

```bash
kubectl -n webbuilder logs deploy/api-registry | grep '<request-id>'
```

Cari upstream call correlation via `upstream_job_id` di job record:

```bash
curl -s http://localhost:5000/v1/jobs/job_xyz | jq
```

### Backup / restore

**In-memory store**: no backup possible (ephemeral). Fase 2 setelah
migrate ke Postgres, standard pg_dump.

**Config**:
```bash
kubectl -n webbuilder get configmap api-registry-config -o yaml > backup-config.yaml
kubectl -n webbuilder get secret api-registry-secrets -o yaml > backup-secret.yaml
# Simpan backup-secret.yaml di secret manager, JANGAN commit git.
```

## Escalation

- **P1** (outage > 10 menit): notify web builder team + customer registrar.
- **P2** (degrade tapi jalan): create incident ticket, monitor.
- **P3** (config drift, no user impact): async fix.

## Contact

- Codebase: [`apps/api-registry/`](../)
- Plan: [`plan-saas-registrar-platform.md`](../../../plan-saas-registrar-platform.md)
- Upstream (Fase 1): registrar-api PANDI — kontak Ops PANDI
