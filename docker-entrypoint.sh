#!/bin/sh
set -e

echo "=== WoWSimc Entrypoint ==="

# Wait for database to be ready (retry up to 30 seconds)
echo "Waiting for database..."
for i in $(seq 1 15); do
  if prisma migrate deploy 2>/dev/null; then
    echo "Migrations applied successfully."
    break
  fi
  echo "Database not ready, retrying in 2s... ($i/15)"
  sleep 2
done

# Try migrations one more time if loop didn't succeed
prisma migrate deploy || echo "WARNING: Migrations may have failed"

# Run seed
echo "Seeding database..."
tsx prisma/seed.ts || echo "Seed completed (some data may already exist)"

echo "Starting server..."
exec node server.js
