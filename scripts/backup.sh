#!/usr/bin/env bash
# =============================================================================
#  ISP-CRM Nightly Database Backup
#  Schedule: 0 3 * * * /opt/isp-crm/scripts/backup.sh
# =============================================================================
set -euo pipefail

BACKUP_DIR="/backups"
DB_CONTAINER="isp_db_core"
DB_NAME="${POSTGRES_DB:-isp_crm}"
DB_USER="${POSTGRES_USER:-isp_admin}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DATE=$(date +%Y-%m-%d_%H-%M)
FILENAME="${BACKUP_DIR}/isp_crm_${DATE}.sql.gz"

echo "[$(date)] Starting backup → ${FILENAME}"

# Perform pg_dump inside container and gzip
docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${FILENAME}"

# Verify backup size
SIZE=$(du -sh "${FILENAME}" | cut -f1)
echo "[$(date)] Backup complete: ${FILENAME} (${SIZE})"

# Remove old backups beyond retention window
find "${BACKUP_DIR}" -name "isp_crm_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Pruned backups older than ${RETENTION_DAYS} days"

# List current backups
echo "[$(date)] Current backups:"
ls -lh "${BACKUP_DIR}"/isp_crm_*.sql.gz 2>/dev/null || echo "  (none)"
