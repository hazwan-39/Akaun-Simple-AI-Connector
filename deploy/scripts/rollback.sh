#!/usr/bin/env bash
# Points `current` back at the previous release (or a named one) and restarts the API.
#   rollback.sh                 -> previous release
#   rollback.sh <release-dir>   -> specific release under releases/
set -euo pipefail
BASE=/home/akaunai/apps/akaun-simple-ai
SERVICE=akaun-simple-ai-api
CURRENT=$(readlink -f "$BASE/current")

if [ $# -ge 1 ]; then
  TARGET="$BASE/releases/$1"
else
  TARGET=$(ls -1dt "$BASE"/releases/*/ | sed 's#/$##' | grep -vx "$CURRENT" | head -n 1)
fi
[ -d "$TARGET" ] || { echo "Release not found: $TARGET"; exit 1; }

echo "Rolling back: $CURRENT -> $TARGET"
ln -sfn "$TARGET" "$BASE/current.tmp" && mv -Tf "$BASE/current.tmp" "$BASE/current"
sudo systemctl restart "$SERVICE"
sleep 2
curl -fsS http://127.0.0.1:8787/api/health && echo " <- healthy"
