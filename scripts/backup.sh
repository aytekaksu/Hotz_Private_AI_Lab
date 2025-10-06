#!/bin/bash
set -e

BACKUP_DIR="/opt/backups/ai-assistant"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${TIMESTAMP}.tar.gz"

echo "Creating backup..."

mkdir -p $BACKUP_DIR

# Stop services to ensure consistent backup
echo "Stopping services..."
docker compose stop

# Backup SQLite databases and .env
echo "Creating backup archive..."
tar -czf "${BACKUP_DIR}/${BACKUP_FILE}" \
  data/sqlite/ \
  apps/n8n/data/ \
  .env 2>/dev/null || true

# Restart services
echo "Restarting services..."
docker compose start

# Keep only last 7 days of backups
echo "Cleaning old backups..."
find $BACKUP_DIR -name "backup_*.tar.gz" -mtime +7 -delete

echo "Backup created: ${BACKUP_DIR}/${BACKUP_FILE}"
echo "Backup completed successfully!"



