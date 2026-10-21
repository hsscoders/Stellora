#!/usr/bin/env bash
# ============================================================
# Stellora — backup-code.sh
# Pura code tree ek zip me /home/z/my-project/download/ me
# daal deta hai (wahan se tum use download kar sakte ho).
#
#   bash scripts/backup-code.sh
#
# Excludes: node_modules, .next, logs, .git (bhaari cheezein)
# Includes: saara source + .env files + scripts + deploy files
# ============================================================
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${BACKUP_DIR:-/home/z/my-project/download}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DEST/stellora-backup-$STAMP.zip"

mkdir -p "$DEST"
cd "$ROOT"

echo "[backup] zipping $ROOT ..."
zip -qr "$OUT" . \
  -x "*/node_modules/*" \
  -x "node_modules/*" \
  -x "*/.next/*" \
  -x ".next/*" \
  -x "logs/*" \
  -x ".git/*" \
  -x "*.zip"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] DONE -> $OUT ($SIZE)"
echo "[backup] restore karne ke liye: zip nikalo + 'bash scripts/restore.sh'"
# Purane backup (7 din se purane) hata do, download folder bhar na jaye
find "$DEST" -name "stellora-backup-*.zip" -mtime +7 -delete 2>/dev/null || true
