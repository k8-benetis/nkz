# Export Storage (MinIO) — Lifecycle to Prevent Leaks

Parquet exports are written to MinIO under the prefix **`exports/`** (e.g. `exports/<tenant_id>/<uuid>.parquet`). Presigned URLs expire after 1 hour. To avoid unbounded growth, MinIO must delete objects under this prefix automatically.

**Residual limit:** The export pipeline still loads the full query result into memory to build the `pa.Table`; for absolute scalability (e.g. 10M+ rows), use server-side cursors and stream into Arrow/CSV/Parquet. See NKZ_DATAHUB_IMPLEMENTATION_PLAN.md § 8.

## Configure MinIO Lifecycle (ILM)

Configure a **lifecycle rule** on the bucket used for exports (e.g. `S3_BUCKET` / `nekazari-frontend` or a dedicated bucket) so that any object under the `exports/` prefix is removed after 1 hour.

### Option 1: MinIO Console

1. Open MinIO Console → Buckets → select the bucket.
2. Add Lifecycle Rule:
   - **Prefix:** `exports/`
   - **Expiry:** 1 day (or 1 hour if your MinIO version supports it; otherwise use the minimum allowed, e.g. 1 day, and optionally reduce presigned URL expiry to match).

### Option 2: mc (MinIO Client)

```bash
# Create lifecycle rule file lifecycle.json
cat > lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "DeleteExportAfter1h",
      "Status": "Enabled",
      "Filter": { "Prefix": "exports/" },
      "Expiration": { "Days": 1 }
    }
  ]
}
EOF

mc ilm add myminio/my-bucket lifecycle.json
```

If your MinIO version supports **Expiration in days** only, use `"Days": 1` and set `PRESIGNED_EXPIRY_SECONDS = 3600` (1 hour) in the service so download links expire before the object is deleted.

### Option 3: Kubernetes / Helm

If MinIO is deployed via Helm or operator, add the lifecycle rule in the bucket configuration so that the `exports/` prefix has a TTL of 1 hour (or 1 day as minimum in some versions).

## Environment Variables (timeseries-reader)

| Variable         | Description |
|------------------|-------------|
| `S3_ENDPOINT_URL` | MinIO endpoint (e.g. `http://minio-service:9000`) |
| `S3_ACCESS_KEY`   | MinIO access key |
| `S3_SECRET_KEY`   | MinIO secret key |
| `S3_BUCKET`       | Bucket name (default: `nekazari-frontend`) |
| `S3_REGION`       | Region (default: `us-east-1`) |

Export objects are stored at: `s3://<S3_BUCKET>/exports/<tenant_id>/<uuid>.parquet`.
