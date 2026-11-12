#!/usr/bin/env bash
# Git-based release deployment with automatic rollback on failed health check.
#
#   deploy.sh <git-ref>        e.g. deploy.sh v1.0.0
#
# Layout:
#   /home/akaunai/apps/akaun-simple-ai/repo        bare-ish git checkout used for fetching
#   /home/akaunai/apps/akaun-simple-ai/releases/<timestamp>-<sha>
#   /home/akaunai/apps/akaun-simple-ai/current  -> symlink to the active release
#
# Only touches this application's directory and its own systemd unit.
set -euo pipefail

REF="${1:?usage: deploy.sh <git-ref>}"
BASE=/home/akaunai/apps/akaun-simple-ai
REPO="$BASE/repo"
RELEASES="$BASE/releases"
SERVICE=akaun-simple-ai-api
HEALTH_URL=http://127.0.0.1:8787/api/health
KEEP=5

cd "$REPO"
git fetch --tags --prune origin
SHA=$(git rev-parse --short "$REF^{commit}")
DEST="$RELEASES/$(date +%Y%m%d%H%M%S)-$SHA"

echo "==> Building $REF ($SHA) in $DEST"
git worktree add --detach "$DEST" "$SHA"
cd "$DEST"
npm ci --no-audit --no-fund
npm test
npm run build
npm prune --omit=dev --no-audit --no-fund

PREVIOUS=$(readlink -f "$BASE/current" || true)
echo "==> Switching current -> $DEST (previous: ${PREVIOUS:-none})"
ln -sfn "$DEST" "$BASE/current.tmp" && mv -Tf "$BASE/current.tmp" "$BASE/current"
sudo systemctl restart "$SERVICE"

for i in $(seq 1 15); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "==> Healthy after ${i}s"
    # Keep the newest $KEEP releases
    ls -1dt "$RELEASES"/*/ | tail -n +$((KEEP + 1)) | while read -r old; do git -C "$REPO" worktree remove --force "$old" || rm -rf "$old"; done
    exit 0
  fi
  sleep 1
done

echo "!!! Health check failed – rolling back"
if [ -n "${PREVIOUS:-}" ]; then
  ln -sfn "$PREVIOUS" "$BASE/current.tmp" && mv -Tf "$BASE/current.tmp" "$BASE/current"
  sudo systemctl restart "$SERVICE"
fi
exit 1
