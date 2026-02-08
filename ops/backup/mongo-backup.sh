#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/srv/apps/enmipueblo/env/app.env}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/enmipueblo/mongo}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MONGO_IMAGE="${MONGO_IMAGE:-mongo:7-jammy}"

ts() { date -u "+%Y-%m-%dT%H:%M:%SZ"; }
fail() { echo "FAIL $(ts) $*"; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

# carga env si existe
if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# URI desde env (si no, desde el contenedor backend)
URI="${MONGODB_URI:-${MONGO_URI:-${MONGO_URL:-${DATABASE_URL:-}}}}"
if [[ -z "$URI" ]] && docker ps --format '{{.Names}}' | grep -q '^enmipueblo_backend$'; then
  URI="$(docker exec enmipueblo_backend sh -lc 'printf "%s" "${MONGODB_URI:-${MONGO_URI:-${MONGO_URL:-${DATABASE_URL:-}}}}"' || true)"
fi

[[ -n "$URI" ]] || fail "Falta MONGODB_URI/MONGO_URI (ponlo en $ENV_FILE)"

FNAME="mongo_$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
OUT_IN_CONTAINER="/backup/$FNAME"

UID="$(id -u)"
GID="$(id -g)"

docker run --rm \
  --user "${UID}:${GID}" \
  -e URI="$URI" \
  -e OUT="$OUT_IN_CONTAINER" \
  -v "$BACKUP_DIR:/backup" \
  "$MONGO_IMAGE" \
  bash -lc 'mongodump --uri="$URI" --archive="$OUT" --gzip'

test -s "$BACKUP_DIR/$FNAME" || fail "Backup no creado: $BACKUP_DIR/$FNAME"

# retención
find "$BACKUP_DIR" -type f -name 'mongo_*.archive.gz' -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null || true

echo "OK backup: $BACKUP_DIR/$FNAME"
