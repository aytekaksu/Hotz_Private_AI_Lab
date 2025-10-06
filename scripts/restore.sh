#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup-file.tar.gz>"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring from backup: $BACKUP_FILE"

# Stop services
echo "Stopping services..."
docker compose down

# Extract backup
echo "Extracting backup..."
tar -xzf "$BACKUP_FILE" -C /

# Restart services
echo "Starting services..."
docker compose up -d

echo "Restore completed successfully!"
echo "Please verify the application is working correctly."



