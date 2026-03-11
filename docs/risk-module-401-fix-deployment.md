# Risk Module 401 Fix - Deployment & Verification Plan

## Summary

**Problem**: Risk API returning 401 errors for all requests
**Root Cause**: Token issuer mismatch - tokens issued by `auth.robotika.cloud` not accepted
**Solution**: Add `KEYCLOAK_HOSTNAME` env var to risk-api and sdm-integration deployments

---

## Changes Made

### Commit: `303e0cb`
```
fix(auth): Add KEYCLOAK_HOSTNAME env var to risk-api and sdm-integration

- risk-api: Add KEYCLOAK_HOSTNAME from ConfigMap to enable public issuer validation
- sdm-integration: Use ConfigMap for KEYCLOAK_PUBLIC_URL (remove hardcoded) and add KEYCLOAK_HOSTNAME
```

### Files Modified
1. `k8s/addons/analytics/risk/risk-api-deployment.yaml` - Added KEYCLOAK_HOSTNAME
2. `k8s/core/services/sdm-integration-deployment.yaml` - Use ConfigMap + add KEYCLOAK_HOSTNAME

---

## Deployment Steps (GitOps)

### Option A: Automatic (ArgoCD auto-sync enabled)

```bash
# 1. Push changes to GitHub
cd /home/g/Documents/nekazari/nkz
git push origin feat/risk-marketplace-and-landing-fix

# 2. Create PR and merge to main
# ArgoCD will automatically detect and sync changes within 3 minutes

# 3. Monitor ArgoCD
open https://argo.robotika.cloud/applications/nkz-addons-analytics
```

### Option B: Manual (if auto-sync disabled)

```bash
# 1. Push and merge PR
git push origin feat/risk-marketplace-and-landing-fix
# Merge PR via GitHub UI

# 2. Force sync in ArgoCD
ssh g@109.123.252.120
sudo kubectl apply -f k8s/addons/analytics/risk/risk-api-deployment.yaml -n nekazari
sudo kubectl apply -f k8s/core/services/sdm-integration-deployment.yaml -n nekazari

# Or via ArgoCD CLI
argocd app sync nkz-addons-analytics --force
```

---

## Verification Steps

### 1. Check Deployment Status

```bash
ssh g@109.123.252.120

# Wait for rollout to complete
sudo kubectl rollout status deployment/risk-api -n nekazari --timeout=120s

# Verify new pod is running
sudo kubectl get pods -n nekazari -l app=risk-api -o wide

# Check pod has correct env vars
sudo kubectl exec -n nekazari deployment/risk-api -- env | grep KEYCLOAK
# Expected output:
# KEYCLOAK_URL=http://keycloak-service:8080
# KEYCLOAK_PUBLIC_URL=https://nekazari.robotika.cloud/auth
# KEYCLOAK_HOSTNAME=auth.robotika.cloud
```

### 2. Check Logs for Issuer Validation

```bash
# Watch logs for successful token validation
sudo kubectl logs -n nekazari -l app=risk-api --tail=100 -f

# Look for these patterns:
# ✅ "Successfully validated token for user: ..."
# ✅ "Token issuer: https://auth.robotika.cloud/auth/realms/nekazari"
# ✅ "Allowed issuers: {...https://auth.robotika.cloud/auth/realms/nekazari...}"

# Should NOT see:
# ❌ "Token issuer ... not in allowed issuers"
# ❌ "Invalid token issuer"
```

### 3. Test API Endpoint

```bash
# Get a fresh token from browser console (F12 → Application → Cookies → nkz_token)
# OR use Keycloak directly:

TOKEN=$(curl -s -X POST "https://auth.robotika.cloud/auth/realms/nekazari/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=<test-user>&password=<password>&grant_type=password&client_id=nekazari-frontend" | jq -r '.access_token')

# Test risk-api endpoint
curl -v "https://nkz.robotika.cloud/api/risks/states?limit=5" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with JSON response
# NOT: 401 Unauthorized
```

### 4. Test from Frontend

```bash
# 1. Open browser: https://nekazari.robotika.cloud/dashboard
# 2. Open DevTools → Network tab
# 3. Navigate to Risks page
# 4. Look for /api/risks/* requests

# Expected:
# ✅ /api/risks/states?limit=30 → 200 OK
# ✅ /api/risks/catalog → 200 OK
# ✅ /api/risks/subscriptions → 200 OK

# NOT:
# ❌ 401 Unauthorized
```

---

## Rollback Plan (if needed)

### Quick Rollback via Git

```bash
# 1. Revert the commit
cd /home/g/Documents/nekazari/nkz
git revert HEAD --no-edit
git push origin feat/risk-marketplace-and-landing-fix

# 2. Merge revert PR
# ArgoCD will auto-sync the revert

# 3. Or force rollback in K8s
ssh g@109.123.252.120
sudo kubectl rollout undo deployment/risk-api -n nekazari
```

### Manual Rollback

```bash
# Restore previous manifest version
git checkout HEAD~1 -- k8s/addons/analytics/risk/risk-api-deployment.yaml
git commit -m "rollback: Revert risk-api auth fix"
git push

# Or directly in K8s
ssh g@109.123.252.120
sudo kubectl set env deployment/risk-api -n nekazari KEYCLOAK_HOSTNAME-
```

---

## Success Criteria

✅ All these must be true:

1. [ ] risk-api pod running with KEYCLOAK_HOSTNAME env var
2. [ ] No "Invalid token issuer" errors in logs
3. [ ] `/api/risks/states` returns 200 OK (not 401)
4. [ ] Frontend can successfully load risk data
5. [ ] Token from `auth.robotika.cloud` is accepted

---

## Monitoring

### Grafana Dashboard

```bash
# Open monitoring dashboard
open https://nekazari.robotika.cloud/grafana

# Check these panels:
- API Gateway: 401 error rate (should decrease)
- Risk API: Request success rate (should increase)
- Keycloak: Token validation success rate
```

### Log Alerts

```bash
# Set up log alert for issuer errors (optional)
ssh g@109.123.252.120
sudo kubectl logs -n nekazari -l app=risk-api --since=1h | grep -i "issuer" | grep -i "not in allowed"
# Should return 0 results after fix
```

---

## Timeline

| Step | Duration | Owner |
|------|----------|-------|
| Push & PR | 5 min | Dev |
| Merge to main | 5 min | Reviewer |
| ArgoCD sync | 3 min | Auto |
| Pod rollout | 2 min | Auto |
| Verification | 10 min | Dev |
| **Total** | **~25 min** | |

---

## Contacts

- **Dev Team**: @g
- **On-call**: Check Grafana on-call schedule
- **Escalation**: Create incident in Mattermost if rollback needed

---

**Document Created**: 2026-03-08
**Related Issue**: Risk module 401 errors
**Fix Commit**: 303e0cb
