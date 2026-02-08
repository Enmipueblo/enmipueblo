#!/usr/bin/env bash
set -euo pipefail

URL="${URL:-https://enmipueblo.com/api/health}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/enmipueblo/mongo}"
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-36}"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
fail() { echo "FAIL $(ts) $*" >&2; exit 1; }

# 1) Health endpoint
resp="$(curl -fsS "$URL" || true)"
echo "$resp" | grep -q '"ok":true' || fail "health endpoint no ok ($URL) resp=$resp"

# 2) Contenedores básicos
docker ps --format '{{.Names}}' | grep -q '^enmipueblo_backend$'  || fail "container enmipueblo_backend no running"
docker ps --format '{{.Names}}' | grep -q '^enmipueblo_frontend$' || fail "container enmipueblo_frontend no running"
docker ps --format '{{.Names}}' | grep -q '^caddy$'              || fail "container caddy no running"

# 3) Último backup reciente
if [[ -d "$BACKUP_DIR" ]]; then
  last_file="$(ls -1t "$BACKUP_DIR"/mongo_*.archive.gz 2>/dev/null | head -n 1 || true)"
  [[ -n "$last_file" ]] || fail "no hay backups en $BACKUP_DIR"

  last_epoch="$(stat -c %Y "$last_file" 2>/dev/null || stat -f %m "$last_file" 2>/dev/null || echo 0)"
  now_epoch="$(date +%s)"
  age_hours="$(( (now_epoch - last_epoch) / 3600 ))"

  if [[ "$age_hours" -gt "$MAX_BACKUP_AGE_HOURS" ]]; then
    fail "backup viejo: ${age_hours}h (max ${MAX_BACKUP_AGE_HOURS}h) file=$last_file"
  fi
fi

echo "OK $(ts) health"
