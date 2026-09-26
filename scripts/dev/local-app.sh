#!/bin/sh
# Run the app locally (hot reload) against the LOCAL Docker Postgres and Mailpit.
#
#   npm run dev:local-db        -> http://localhost:3021
#
# Credentials come from .env.docker, so the live Supabase values in .env are
# never used: the explicit exports below win over anything Next loads from .env.
set -e
cd "$(dirname "$0")/../.."

if [ ! -f .env.docker ]; then
  echo "missing .env.docker — the local stack's credentials live there" >&2
  exit 1
fi

set -a
. ./.env.docker
set +a

PORT="${LOCAL_APP_PORT:-3021}"
DB_PORT="${POSTGRES_PORT:-55432}"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${DB_PORT}/${POSTGRES_DB}"
export DIRECT_URL="$DATABASE_URL"
export DATABASE_TYPE=postgresql

echo "[local] database : 127.0.0.1:${DB_PORT}/${POSTGRES_DB} (Docker)"
echo "[local] mail      : Mailpit http://localhost:${MAILPIT_UI_PORT:-8025}"
echo "[local] app       : http://localhost:${PORT}"

exec npx next dev -p "$PORT"
