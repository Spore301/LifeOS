#!/usr/bin/env bash
# Server-side deploy. Run on the host, either by the CD workflow over SSH or by
# hand:  ~/LifeOS/scripts/deploy.sh
#
# Deliberately does the whole job on the server rather than shipping images: the
# box has 2 GB and a swapfile, which is enough to build, and it keeps the
# pipeline free of a registry and its credentials.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/LifeOS}"
HEALTH_URL="${HEALTH_URL:-https://lifeostech.site/api/auth/providers}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

cd "$APP_DIR"

# Record where we were, so a failed deploy can be put back.
PREVIOUS=$(git rev-parse HEAD)
echo "current: $PREVIOUS"

git fetch --quiet origin main
git reset --hard --quiet origin/main
echo "deploying: $(git rev-parse HEAD) - $(git log -1 --pretty=%s)"

if [ "$PREVIOUS" = "$(git rev-parse HEAD)" ]; then
  echo "already up to date; rebuilding anyway to pick up any .env change"
fi

sudo "${COMPOSE[@]}" up -d --build

# Give the app a moment to bind before deciding it is broken.
echo "waiting for health..."
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || echo 000)
  if [ "$code" = "200" ]; then
    echo "healthy after ${i} checks (HTTP $code)"
    # Old image layers pile up fast on a 58 GB disk across repeated deploys.
    sudo docker image prune -f >/dev/null
    echo "deploy ok"
    exit 0
  fi
  sleep 4
done

echo "UNHEALTHY after deploy (last HTTP $code) - rolling back to $PREVIOUS"
git reset --hard --quiet "$PREVIOUS"
sudo "${COMPOSE[@]}" up -d --build
echo "rolled back"
exit 1
