#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker stop epubreader 2>/dev/null || true
docker rm epubreader 2>/dev/null || true

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi

if [[ "${WORKS_DIR:-works}" = /* ]]; then
  WORKS_PATH="$WORKS_DIR"
else
  WORKS_PATH="$PWD/${WORKS_DIR:-works}"
fi
mkdir -p "$WORKS_PATH"

docker run -d \
  --name epubreader \
  -p 9077 \
  -v "$PWD:/usr/src/app" \
  -v "$WORKS_PATH:/usr/src/app/works" \
  -e NODE_ENV=production \
  -e PORT=9070 \
  -e WORKS_DIR=/usr/src/app/works \
  -e SITE_URL="${SITE_URL:-http://localhost:9070}" \
  -e VIRTUAL_HOST="${VIRTUAL_HOST:-}" \
  -e LETSENCRYPT_HOST="${LETSENCRYPT_HOST:-${VIRTUAL_HOST:-}}" \
  -e LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}" \
  --restart unless-stopped \
  -w /usr/src/app \
  node:22 \
  bash -lc "npm ci && npm run docker:start"

echo "Lettore EPUB avviato. Controlla: docker logs -f epubreader"
