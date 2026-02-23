# Risk Integrations

This document describes how external systems (N8N, custom APIs, third-party platforms) can consume risk evaluations from the Nekazari platform.

Two integration models are available: **pull (polling)** and **push (webhook)**.

---

## 1. Pull Model — N8N / polling via SQL view

The database exposes a view `risk_notifications_pending` that surfaces recent risk evaluations
that have not yet been acknowledged. N8N or any system with read access can poll this view.

### SQL view

```sql
-- risk_notifications_pending is defined in the risk_management_system migration.
-- Example query (run with tenant RLS context set):
SELECT *
FROM risk_notifications_pending
WHERE severity IN ('high', 'critical')
ORDER BY evaluation_timestamp DESC
LIMIT 100;
```

### N8N workflow (polling approach)

1. **Trigger**: Schedule Node (every 30 min or 1 hour)
2. **Action**: Postgres Node → `SELECT * FROM risk_notifications_pending WHERE ...`
3. **Filter**: IF node — filter by `severity`, `risk_code`, or `entity_id`
4. **Notification**: Send Email / Slack / Telegram / HTTP Request node
5. **Mark read** (optional): Postgres Node → `UPDATE risk_daily_states SET notified = true WHERE id = ...`

The workflow file `workflows/n8n-workflow-risk-notifications.json` in this repository
provides a ready-to-import N8N workflow for this model.

---

## 2. Push Model — Webhook registration

Tenants can register a URL to receive HTTP POST events the moment a risk evaluation
exceeds their configured severity threshold.

### Register a webhook

```http
POST /api/risks/webhooks
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "My N8N workflow",
  "url": "https://n8n.example.com/webhook/risk-alert",
  "secret": "my-hmac-secret",           // optional — enables HMAC signature
  "events": ["risk_evaluation"],
  "min_severity": "high"                // low | medium | high | critical
}
```

Response `201`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenant_id": "my-tenant",
  "name": "My N8N workflow",
  "url": "https://n8n.example.com/webhook/risk-alert",
  "events": ["risk_evaluation"],
  "min_severity": "high",
  "is_active": true,
  "created_at": "2026-02-23T15:00:00Z"
}
```

### List webhooks

```http
GET /api/risks/webhooks
Authorization: Bearer <jwt>
```

### Delete a webhook

```http
DELETE /api/risks/webhooks/<id>
Authorization: Bearer <jwt>
```

---

### Webhook event payload

When a risk evaluation fires, Nekazari sends a `POST` to each registered URL:

```json
{
  "event": "risk_evaluation",
  "tenant_id": "farm-demo",
  "entity_id": "urn:ngsi-ld:AgriParcel:parcel-001",
  "risk_code": "SPRAY_SUITABILITY",
  "probability_score": 88.0,
  "severity": "high",
  "timestamp": "2026-02-23T15:00:00Z"
}
```

### HMAC signature verification

If a `secret` was provided at registration time, every request includes:

```
X-Nekazari-Signature: sha256=<hex-digest>
```

The signature is computed as:

```python
import hmac, hashlib, json

body = json.dumps(payload)                  # exact bytes sent
sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
expected_header = f"sha256={sig}"
```

To verify in N8N (Function node):

```javascript
const crypto = require('crypto');
const secret = 'my-hmac-secret';
const body = JSON.stringify($input.first().json);
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
const received = $input.first().headers['x-nekazari-signature'];
if (received !== `sha256=${sig}`) throw new Error('Invalid signature');
return $input.all();
```

### Delivery guarantees

- **Timeout**: 5 seconds per request
- **Retries**: none (fire-and-forget) — register a resilient URL (e.g., N8N webhook with queue)
- **Errors**: logged server-side, delivery failures do not block risk processing

---

## Comparison

| | Pull (SQL / N8N polling) | Push (Webhook) |
|---|---|---|
| Latency | Minutes (poll interval) | Seconds (real-time) |
| Setup | N8N + DB credentials | Register URL via API |
| Auth | DB role or API token | JWT + optional HMAC |
| Retries | Built into N8N | None (fire-and-forget) |
| Best for | Batch reports, dashboards | Real-time alerts, integrations |
