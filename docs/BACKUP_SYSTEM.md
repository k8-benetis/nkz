# Backup System Documentation

## Overview

The Nekazari platform includes automated backup systems for all critical databases and services. Backups are scheduled via Kubernetes CronJobs and automatically uploaded to IONOS SFTP server.

## Backup Components

### 1. PostgreSQL Backup

**CronJob:** `postgresql-backup-sftp`  
**Schedule:** Every 6 hours (`0 */6 * * *`)  
**Location:** `k8s/k3s-optimized/postgresql-backup-cronjob.yaml`

**What it backs up:**
- All PostgreSQL databases (nekazari, keycloak, activation_codes_db, etc.)
- Uses `pg_dumpall` to create a complete backup
- Compressed with gzip

**Configuration:**
- Requires `ionos-sftp-creds` Secret with keys: `host`, `user`, `password`, `remote_dir`
- Requires `postgresql-secret` Secret with key: `password`
- Remote directory: `/backups_nkz` (configurable via Secret)

### 2. MongoDB Backup

**CronJob:** `mongodb-backup-sftp`  
**Schedule:** Every 6 hours (`0 */6 * * *`)  
**Location:** `k8s/k3s-optimized/mongodb-backup-cronjob.yaml`

**What it backs up:**
- All MongoDB databases (orion-ld entities, etc.)
- Uses `mongodump` to create archive backup
- Compressed with gzip

**Configuration:**
- Requires `ionos-sftp-creds` Secret with keys: `host`, `user`, `password`, `remote_dir`
- Requires `mongodb-secret` Secret with keys: `root-username`, `root-password`
- Remote directory: `/backups_nkz` (configurable via Secret)

## Required Secrets

### IONOS SFTP Credentials

Create the `ionos-sftp-creds` Secret with:

```bash
kubectl create secret generic ionos-sftp-creds -n nekazari \
  --from-literal=host='your-sftp-host.com' \
  --from-literal=user='your-sftp-user' \
  --from-literal=password='your-sftp-password' \
  --from-literal=remote_dir='/backups_nkz'
```

**Note:** These credentials are NOT stored in Git. They must be created manually on each deployment.

### Database Secrets

- `postgresql-secret`: Contains PostgreSQL password (key: `password`)
- `mongodb-secret`: Contains MongoDB credentials (keys: `root-username`, `root-password`)

## Deployment

### Initial Setup

1. **Create IONOS SFTP Secret:**
   ```bash
   kubectl create secret generic ionos-sftp-creds -n nekazari \
     --from-literal=host='your-sftp-host' \
     --from-literal=user='your-sftp-user' \
     --from-literal=password='your-sftp-password' \
     --from-literal=remote_dir='/backups_nkz'
   ```

2. **Deploy CronJobs:**
   ```bash
   kubectl apply -f k8s/k3s-optimized/postgresql-backup-cronjob.yaml
   kubectl apply -f k8s/k3s-optimized/mongodb-backup-cronjob.yaml
   ```

3. **Verify:**
   ```bash
   kubectl get cronjobs -n nekazari | grep backup
   ```

### Manual Backup Test

Test PostgreSQL backup:
```bash
kubectl create job --from=cronjob/postgresql-backup-sftp postgresql-backup-test-$(date +%s) -n nekazari
kubectl logs -n nekazari -l job-name --tail=100
```

Test MongoDB backup:
```bash
kubectl create job --from=cronjob/mongodb-backup-sftp mongodb-backup-test-$(date +%s) -n nekazari
kubectl logs -n nekazari -l job-name --tail=100
```

## Backup File Naming

- **PostgreSQL:** `backup-nkz-YYYYMMDD-HHMMSS.sql.gz`
- **MongoDB:** `backup-mongodb-nkz-YYYYMMDD-HHMMSS.archive.gz`

## Monitoring

### Check CronJob Status

```bash
kubectl get cronjobs -n nekazari
```

### Check Recent Backup Jobs

```bash
kubectl get jobs -n nekazari | grep backup
```

### View Backup Logs

```bash
# Get latest backup job
JOB_NAME=$(kubectl get jobs -n nekazari | grep postgresql-backup | tail -1 | awk '{print $1}')
kubectl logs -n nekazari job/$JOB_NAME
```

### Check Backup History

```bash
# PostgreSQL backups
kubectl get jobs -n nekazari | grep postgresql-backup-sftp

# MongoDB backups
kubectl get jobs -n nekazari | grep mongodb-backup-sftp
```

## Troubleshooting

### Backup Jobs Failing

1. **Check Secret exists:**
   ```bash
   kubectl get secret ionos-sftp-creds -n nekazari
   kubectl get secret postgresql-secret -n nekazari
   kubectl get secret mongodb-secret -n nekazari
   ```

2. **Check job logs:**
   ```bash
   kubectl logs -n nekazari job/<job-name>
   ```

3. **Common issues:**
   - Missing secrets → Create required secrets
   - SFTP connection failed → Verify SFTP credentials
   - Database connection failed → Verify database is running and accessible
   - Script syntax errors → Check YAML syntax

### Manual Backup Execution

If automatic backups fail, you can manually trigger a backup:

```bash
# PostgreSQL
kubectl create job --from=cronjob/postgresql-backup-sftp manual-backup-$(date +%s) -n nekazari

# MongoDB
kubectl create job --from=cronjob/mongodb-backup-sftp manual-backup-$(date +%s) -n nekazari
```

## GitOps Compliance

All backup configurations are stored in Git:
- `k8s/k3s-optimized/postgresql-backup-cronjob.yaml`
- `k8s/k3s-optimized/mongodb-backup-cronjob.yaml`

**Secrets are NOT in Git** - they must be created manually on each deployment:
- `ionos-sftp-creds` (SFTP credentials)
- `postgresql-secret` (PostgreSQL password)
- `mongodb-secret` (MongoDB credentials)

## Backup Retention

- **Local:** Backups are cleaned up immediately after upload
- **Remote (IONOS):** Manual cleanup recommended (>7 days old)
- **Job History:** Kubernetes keeps last 3 successful and 3 failed jobs

## Restore Procedure

### PostgreSQL Restore

```bash
# Download backup from SFTP
# Extract: gunzip backup-nkz-YYYYMMDD-HHMMSS.sql.gz

# Restore
kubectl exec -n nekazari deployment/postgresql -- psql -U postgres < backup-nkz-YYYYMMDD-HHMMSS.sql
```

### MongoDB Restore

```bash
# Download backup from SFTP
# Restore
kubectl exec -n nekazari deployment/mongodb -- mongorestore --archive=backup-mongodb-nkz-YYYYMMDD-HHMMSS.archive.gz --gzip
```

## Security Notes

- SFTP credentials are stored in Kubernetes Secrets (encrypted at rest)
- Backups are compressed to reduce transfer time and storage
- All backups are uploaded to offsite location (IONOS)
- No backup data is stored in Git repository

