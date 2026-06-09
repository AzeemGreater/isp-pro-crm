#!/bin/bash
# Script to backup PostgreSQL database and upload to Google Drive via rclone

# Variables
DB_CONTAINER="isp_db_core"
DB_USER="postgres"
DB_NAME="ispcrm"
BACKUP_DIR="/var/backups/ispcrm"
DATE=$(date +"%Y%m%d_%H%M%S")
FILE_NAME="ispcrm_backup_${DATE}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${FILE_NAME}"
GDRIVE_REMOTE="gdrive:ISP_Backups"

# Create backup dir if not exists
mkdir -p "${BACKUP_DIR}"

echo "Starting backup for database: ${DB_NAME}"

# Dump and compress database
docker exec -t ${DB_CONTAINER} pg_dump -U ${DB_USER} ${DB_NAME} | gzip > "${BACKUP_PATH}"

# Check if dump was successful
if [ $? -eq 0 ]; then
    echo "Backup successful: ${BACKUP_PATH}"
    
    # Upload to Google Drive using rclone
    echo "Uploading to Google Drive..."
    rclone copy "${BACKUP_PATH}" "${GDRIVE_REMOTE}"
    
    if [ $? -eq 0 ]; then
        echo "Upload successful."
        
        # Cleanup old backups (keep last 7 days locally)
        find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +7 -delete
        
        # Optional: delete old backups from gdrive (keep last 30 days)
        # rclone delete --min-age 30d "${GDRIVE_REMOTE}"
    else
        echo "Upload to Google Drive failed!"
    fi
else
    echo "Database backup failed!"
    rm -f "${BACKUP_PATH}"
fi
