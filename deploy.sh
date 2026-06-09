#!/bin/bash
# VPS Deployment Script for ISP System Pro

set -e

echo "Starting deployment for ISP System Pro..."

# 1. Pull latest changes
echo "Pulling latest code from GitHub..."
git pull origin main

# 2. Rebuild containers
echo "Rebuilding Docker containers..."
docker-compose down
docker-compose up -d --build

# 3. Apply database migrations if any (assuming volume handles standard schema, but restarting backend applies schema on boot if handled there)
echo "Restarting backend to apply potential schema updates..."
docker-compose restart backend

echo "Deployment completed successfully!"
