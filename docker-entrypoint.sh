#!/bin/sh
set -e

echo "=== WoWSimc Entrypoint ==="

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Run seed if FIRST_RUN is set or seed hasn't run yet
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Seeding database..."
  npx tsx prisma/seed.ts || echo "Seed completed (some data may already exist)"
fi

echo "Starting server..."
exec node server.js
