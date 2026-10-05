#!/usr/bin/env bash
# Browser end-to-end tests against the running docker compose stack (dev auth + fixture catalogue).
#   docker compose up -d --build && scripts/test-e2e.sh [playwright args]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" \
  -v "$ROOT/e2e":/e2e -w /e2e -e HOME=/tmp -e BASE_URL="${BASE_URL:-http://localhost:8080}" \
  mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test "$@"
