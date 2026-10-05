#!/usr/bin/env bash
# Run the Go toolchain in a container (no Go on the host): scripts/go.sh test ./...
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/libax-go"
mkdir -p "$CACHE"
exec docker run --rm \
  --user "$(id -u):$(id -g)" --network host \
  -v "$ROOT/backend":/src -v "$CACHE":/cache -w /src \
  -e HOME=/cache -e GOCACHE=/cache/build -e GOMODCACHE=/cache/mod -e GOFLAGS=-buildvcs=false \
  -e TEST_DATABASE_URL="${TEST_DATABASE_URL:-}" \
  golang:1.26-alpine go "$@"
