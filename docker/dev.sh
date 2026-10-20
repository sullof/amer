#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker rm -f epubreader-dev 2>/dev/null || true

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

docker run -it --rm \
  --name epubreader-dev \
  -p 9077:9077 \
  -v "$PWD:/usr/src/app" \
  -v "$WORKS_PATH:/usr/src/app/works" \
  -e NODE_ENV=development \
  -e PORT=9077 \
  -e WORKS_DIR=/usr/src/app/works \
  -e SITE_URL="http://localhost:9077" \
  -w /usr/src/app \
  node:22 \
  bash -lc "npm install && npm run dev"
