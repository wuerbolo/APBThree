#!/usr/bin/env bash
# Basic deploy: pull latest master, rebuild the image, restart the app
# container, then verify it actually responds before calling it done.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

DOMAIN="${DOMAIN:-bolo.wuerbo.com}"

echo "==> Pulling latest master"
git fetch origin
git checkout master
git pull --ff-only origin master

echo "==> Building image"
docker compose build

echo "==> Restarting container"
docker compose up -d

echo "==> Waiting for health check"
for i in $(seq 1 15); do
  if curl -fsS -o /dev/null "https://${DOMAIN}"; then
    echo "==> Deploy OK: https://${DOMAIN} is responding"
    exit 0
  fi
  sleep 2
done

echo "==> Deploy FAILED: https://${DOMAIN} did not respond after 30s" >&2
docker compose logs --tail 50 app >&2
exit 1
