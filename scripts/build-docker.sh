#!/bin/bash
# Build the card using Docker (isolates Node.js/npm for security)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "🐳 Building card using Docker (isolated environment)..."

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: docker not found"
    echo "   Install Docker or use: npm run build"
    exit 1
fi

# Clean dist directory to ensure fresh build
if [ -d "dist" ]; then
    rm -rf dist/*
fi
mkdir -p dist

# Build the image
echo "📦 Building Docker image..."
# Use --no-cache if FORCE_REBUILD is set, or if config files changed recently
FORCE_REBUILD="${FORCE_REBUILD:-0}"
if [ "$FORCE_REBUILD" = "1" ]; then
    echo "   Force rebuild (no cache)..."
    docker build --no-cache -f Dockerfile.build -t bom-local-card-builder .
else
    # Check if config files are newer than the image
    # This ensures we rebuild when tsconfig.json, rollup.config.js, or package.json change
    docker build -f Dockerfile.build -t bom-local-card-builder .
fi

# Run the build container and copy file out
echo "🔨 Running build..."
# Pass NODE_ENV through to the container if set
ENV_ARGS=""
if [ -n "$NODE_ENV" ]; then
    echo "   Setting NODE_ENV=$NODE_ENV"
    ENV_ARGS="-e NODE_ENV=$NODE_ENV"
fi

# Run the container (using volume for dist to get the output)
docker run --rm $ENV_ARGS -v "$(pwd)/dist:/build/dist" bom-local-card-builder

# Check if build succeeded
if [ ! -f "dist/bom-local-radar-card.js" ]; then
    echo "❌ Error: Build failed - dist/bom-local-radar-card.js not found"
    exit 1
fi

FILE_SIZE=$(stat -f%z "dist/bom-local-radar-card.js" 2>/dev/null || stat -c%s "dist/bom-local-radar-card.js" 2>/dev/null || echo "0")
echo "✅ Build complete (${FILE_SIZE} bytes)"

