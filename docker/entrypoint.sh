#!/bin/sh
# Container entrypoint for @lava/api.
#
# 1. Run Drizzle migrations against DATABASE_URL (idempotent — no-op if up to date).
# 2. exec the CMD (the API server).
#
# Using `exec` at the end means the API becomes PID 1, so Docker stop signals
# (SIGTERM) are delivered to Bun directly and the container shuts down cleanly.

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL is not set" >&2
  exit 1
fi

echo "[entrypoint] Running Drizzle migrations…"
cd /app/packages/db
bunx drizzle-kit migrate
cd /app

echo "[entrypoint] Migrations complete. Starting API on port ${PORT:-3000}…"
exec "$@"
