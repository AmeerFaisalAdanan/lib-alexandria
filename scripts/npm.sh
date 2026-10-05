#!/usr/bin/env bash
# Run Node/npm in a container (no Node on the host): scripts/npm.sh run lint
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/libax-npm"
mkdir -p "$CACHE"
exec docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$ROOT":/app -v "$CACHE":/cache -w /app \
  -e HOME=/cache -e npm_config_cache=/cache/npm -e NEXT_TELEMETRY_DISABLED=1 \
  node:22-alpine npm "$@"
