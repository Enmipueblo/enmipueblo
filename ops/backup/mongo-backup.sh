#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/srv/apps/enmipueblo/env/app.env}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/enmipueblo/mongo}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || true

# carga env si existe
if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# URI desde env (si no, desde el contenedor backend)
URI="${MONGODB_URI:-${MONGO_URI:-${MONGO_URL:-${DATABASE_URL:-}}}}"
if [[ -z "$URI" ]] && docker ps --format '{{.Names}}' | grep -q '^enmipueblo_backend$'; then
  URI="$(docker exec enmipueblo_backend sh -lc 'printf "%s" "${MONGODB_URI:-${MONGO_URI:-${MONGO_URL:-${DATABASE_URL:-}}}}"' 2>/dev/null || true)"
fi

[[ -n "$URI" ]] || { echo "ERROR: no hay URI de mongo (MONGODB_URI/MONGO_URI/etc)"; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="mongo_${STAMP}.archive.gz"

docker run --rm \
  -v "$BACKUP_DIR:/backup" \
  mongo:7-jammy \
  mongodump --uri="$URI" --archive="/backup/$OUT" --gzip

find "$BACKUP_DIR" -type f -name 'mongo_*.archive.gz' -mtime +"$RETENTION_DAYS" -delete || true

echo "OK backup: $BACKUP_DIR/$OUT"
