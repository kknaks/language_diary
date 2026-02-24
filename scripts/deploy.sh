#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

source secret.env

echo "=== Logging in to GHCR ==="
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin

echo "=== Pulling & starting services ==="
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

echo "=== Pruning unused images ==="
docker image prune -f

echo "=== Deploy completed at $(date) ==="
