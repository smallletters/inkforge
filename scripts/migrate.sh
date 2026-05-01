#!/bin/bash
# InkForge Database Migration Script
# Author: <smallletters@sina.com>
# Created: 2026-04-29

set -e

DATABASE_URL="${DATABASE_URL:-postgresql://inkforge:inkforge@localhost:5432/inkforge}"

echo "Running database migrations for InkForge..."

# Using drizzle-kit push to apply schema
cd "$(dirname "$0")/.."

echo "Using drizzle-kit to push schema..."
pnpm --filter backend exec drizzle-kit push

echo "Migration completed successfully!"
