#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

port="${PORT:-3000}"

ip=""
for iface in en0 en1 bridge0; do
  ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then
    break
  fi
done
if [[ -z "$ip" ]]; then
  ip="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }')"
fi
if [[ -z "$ip" ]]; then
  echo "Non trovo un indirizzo sulla rete locale." >&2
  exit 1
fi

export HOST=0.0.0.0
export PORT="$port"
export SITE_URL="http://${ip}:${port}"

echo "Dal telefono, sulla stessa rete Wi-Fi: ${SITE_URL}"
echo "Per fermare: Ctrl-C"

exec npm run dev
