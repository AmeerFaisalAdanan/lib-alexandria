#!/usr/bin/env bash
# Run the Go test suite against a throwaway PostgreSQL container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="libax-test-db"
PORT="${TEST_DB_PORT:-55432}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=libax_test \
  -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -d libax_test >/dev/null 2>&1 && break
  sleep 0.5
done
sleep 1

export TEST_DATABASE_URL="postgres://postgres:test@127.0.0.1:$PORT/libax_test?sslmode=disable"
"$ROOT/scripts/go.sh" test -count=1 "${@:-./...}"
