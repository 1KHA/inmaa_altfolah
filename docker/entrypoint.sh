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

# Local stand-in for Vercel Cron: poll the cron endpoints every minute so
# booking reminders and the email queue work in Docker too (LOCAL_CRON=true).
if [ "${LOCAL_CRON:-false}" = "true" ] && [ -n "${CRON_SECRET:-}" ]; then
  echo "[entrypoint] local cron poller enabled (every 60s)"
  (
    sleep 20
    while true; do
      for path in /api/cron/booking-reminders /api/cron/drain-email-queue; do
        wget -q -O /dev/null --header="Authorization: Bearer ${CRON_SECRET}" "http://127.0.0.1:${PORT:-3000}${path}" || true
      done
      sleep 60
    done
  ) &
fi

echo "[entrypoint] starting Next.js server on port ${PORT:-3000}"
exec node server.js
