#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/strategist-marketplaces}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-strategist-marketplaces}"

cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run build
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,25p'
