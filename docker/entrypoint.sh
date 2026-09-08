#!/bin/sh
set -e

PRISMA="node node_modules/prisma/build/index.js"

# Apply any pending migrations. Retries cover the window where the postgres
# container is up but not yet accepting connections.
echo "[entrypoint] applying database migrations..."
tries=0
until $PRISMA migrate deploy; do
  tries=$((tries + 1))
  if [ "$tries" -ge 10 ]; then
    echo "[entrypoint] database not reachable after 10 attempts, giving up" >&2
    exit 1
  fi
  echo "[entrypoint] migrate failed (attempt $tries/10), retrying in 3s..."
  sleep 3
done

# Seed the admin accounts (idempotent upserts) unless explicitly disabled.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] seeding admin accounts..."
  node prisma/seed.js
fi

echo "[entrypoint] starting Next.js server on port ${PORT:-3000}"
exec node server.js
