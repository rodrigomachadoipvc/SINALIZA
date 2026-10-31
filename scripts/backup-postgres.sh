#!/bin/sh
# PostgreSQL backup: one compressed dump (pg_dump -Fc) per service database, kept for
# BACKUP_KEEP_DAYS days. Runs from cron on the VM (docs/DEPLOY.md); works locally too.
#   sh scripts/backup-postgres.sh
# Restore one database (see docs/DEPLOY.md):
#   docker compose exec -T postgis sh -c 'pg_restore -U "$POSTGRES_USER" --clean --if-exists -d occurrence_db' < backups/occurrence_db-<stamp>.dump
set -eu

cd "$(dirname "$0")/.."

# Read BACKUP_DIR and BACKUP_KEEP_DAYS from .env when they are not in the environment.
env_value() {
  [ -f .env ] && sed -n "s/^$1=//p" .env | tail -n 1
}
DEST=${BACKUP_DIR:-$(env_value BACKUP_DIR)}
DEST=${DEST:-backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-$(env_value BACKUP_KEEP_DAYS)}
KEEP_DAYS=${KEEP_DAYS:-14}

stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

for db in identity_db occurrence_db municipal_db; do
  out="$DEST/$db-$stamp.dump"
  # Write to a temporary name so a failed dump never looks like a good one.
  docker compose exec -T postgis sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$1"' _ "$db" > "$out.part"
  mv "$out.part" "$out"
  echo "$out ($(wc -c < "$out" | tr -d ' ') bytes)"
done

find "$DEST" -name '*.dump' -mtime +"$KEEP_DAYS" -delete
