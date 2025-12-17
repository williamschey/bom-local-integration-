#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# Cleanup function to stop containers
cleanup() {
    echo ""
    echo "🛑 Shutting down containers..."
    COMPOSE_FILES="-f docker-compose.test.yml"
    if [ -f "docker-compose.test.local.yml" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.test.local.yml"
    fi
    docker compose $COMPOSE_FILES down 2>/dev/null || docker-compose $COMPOSE_FILES down 2>/dev/null || true
    rm -f docker-compose.test.local.yml
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM to run cleanup
trap cleanup SIGINT SIGTERM

# Port configuration (can be overridden via environment variables)
SERVICE_HOST_PORT="${BOM_SERVICE_PORT:-8082}"
HA_HOST_PORT="${HA_PORT:-8124}"


# Parse command-line arguments
SKIP_BUILD=0
FORCE_BUILD=0
USE_DOCKER_BUILD=""
USE_NPM_BUILD=""
SERVICE_PATH=""

show_help() {
    cat <<EOF
Usage: $0 [OPTIONS]

Start or update the test environment for bom-local-card.

Options:
  --skip-build              Skip building the card (use existing dist file)
  --force-build            Force rebuild of the card (no cache)
  --docker-build           Use Docker to build the card (isolated environment)
  --npm-build              Use npm to build the card (requires local Node.js)
  --service-path PATH      Build service from local source at PATH instead of using pre-built image
  -h, --help               Show this help message

Examples:
  $0                                    # Auto-detect build method, use pre-built service
  $0 --force-build                      # Force rebuild card, use pre-built service
  $0 --docker-build                     # Build card with Docker
  $0 --service-path ../bom-local-service  # Build service from local source
  $0 --force-build --service-path ../bom-local-service  # Both options

Notes:
  - If containers are already running, the script automatically updates the card
    and restarts Home Assistant (preserves HA state)
  - Use --service-path to test local service changes without pushing releases
  - The script auto-detects Docker or npm for building (Docker preferred)
EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=1
            shift
            ;;
        --force-build)
            FORCE_BUILD=1
            shift
            ;;
        --docker-build)
            USE_DOCKER_BUILD=1
            shift
            ;;
        --npm-build)
            USE_NPM_BUILD=1
            shift
            ;;
        --service-path)
            if [ -z "$2" ]; then
                echo "❌ Error: --service-path requires a path argument"
                exit 1
            fi
            SERVICE_PATH="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            ;;
        *)
            echo "❌ Error: Unknown option: $1"
            echo "   Use --help for usage information"
            exit 1
            ;;
    esac
done

# Validate service path if provided
if [ -n "$SERVICE_PATH" ]; then
    # Resolve to absolute path
    if [ ! -d "$SERVICE_PATH" ]; then
        echo "❌ Error: Service path does not exist: $SERVICE_PATH"
        exit 1
    fi
    SERVICE_PATH="$(cd "$SERVICE_PATH" && pwd)"
    if [ ! -f "$SERVICE_PATH/BomLocalService.csproj" ]; then
        echo "❌ Error: SERVICE_PATH does not point to a valid service directory"
        echo "   Expected BomLocalService.csproj at: $SERVICE_PATH/BomLocalService.csproj"
        exit 1
    fi
    echo "📦 Using local service source: $SERVICE_PATH"
fi

# Auto-detect build method if not specified
if [ -z "$USE_DOCKER_BUILD" ] && [ -z "$USE_NPM_BUILD" ]; then
    # Prefer Docker if available, fallback to npm
    if command -v docker &> /dev/null; then
        USE_DOCKER_BUILD=1
    elif command -v npm &> /dev/null; then
        USE_NPM_BUILD=1
    else
        echo "❌ Error: Neither Docker nor npm found"
        echo "   Please install Docker or Node.js/npm"
        exit 1
    fi
fi

# Function to build using npm (local)
build_with_npm() {
    echo "🔨 Building card with npm (local)..."
    if ! command -v npm &> /dev/null; then
        echo "❌ Error: npm not found"
        echo "   Install Node.js/npm or use Docker: ./scripts/test.sh --docker-build"
        exit 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo "📦 Installing dependencies..."
        npm install
    fi
    
    npm run build
}

# Function to build using Docker
build_with_docker() {
    echo "🐳 Building card using Docker (isolated environment)..."
    if ! command -v docker &> /dev/null; then
        echo "❌ Error: docker not found"
        echo "   Install Docker or use npm: ./scripts/test.sh --npm-build"
        exit 1
    fi
    
    # Pass FORCE_REBUILD if FORCE_BUILD is set
    if [ "$FORCE_BUILD" = "1" ]; then
        FORCE_REBUILD=1 bash scripts/build-docker.sh
    else
        bash scripts/build-docker.sh
    fi
}

# Build card
if [ "$SKIP_BUILD" = "1" ]; then
    echo "⏭️  Skipping build (--skip-build)"
    if [ ! -f "dist/bom-local-radar-card.js" ]; then
        echo "❌ Error: dist/bom-local-radar-card.js not found and --skip-build was used"
        exit 1
    fi
elif [ "$FORCE_BUILD" = "1" ] || [ ! -f "dist/bom-local-radar-card.js" ]; then
    # If FORCE_BUILD is set, also force Docker rebuild
    if [ "$FORCE_BUILD" = "1" ] && [ "$USE_DOCKER_BUILD" = "1" ]; then
        export FORCE_REBUILD=1
    fi
    if [ "$USE_DOCKER_BUILD" = "1" ]; then
        build_with_docker
    elif [ "$USE_NPM_BUILD" = "1" ]; then
        build_with_npm
    else
        # Auto-detect: prefer Docker, fallback to npm
        if command -v docker &> /dev/null; then
            build_with_docker
        else
            build_with_npm
        fi
    fi
    
    if [ ! -f "dist/bom-local-radar-card.js" ]; then
        echo "❌ Error: dist/bom-local-radar-card.js not found after build"
        exit 1
    fi
    
    # Verify build quality
    FILE_SIZE=$(stat -f%z "dist/bom-local-radar-card.js" 2>/dev/null || stat -c%s "dist/bom-local-radar-card.js" 2>/dev/null || echo "0")
    if [ "$FILE_SIZE" -lt 50000 ]; then
        echo "⚠️  Warning: Built file is suspiciously small (${FILE_SIZE} bytes)"
        echo "   This might indicate dependencies weren't bundled correctly"
        echo "   Check rollup.config.js - dependencies should NOT be marked as external"
    fi
    
    # Check for external imports (should not exist if dependencies are bundled)
    if grep -q "from ['\"]lit['\"]" dist/bom-local-radar-card.js 2>/dev/null || \
       grep -q "from ['\"]custom-card-helpers['\"]" dist/bom-local-radar-card.js 2>/dev/null; then
        echo "⚠️  Warning: Found external import statements in built file"
        echo "   Dependencies may not be bundled. Check rollup.config.js"
    fi
    
    echo "✅ Build complete (${FILE_SIZE} bytes)"
else
    echo "✅ Using existing dist/bom-local-radar-card.js"
    echo "   (Use --force-build to rebuild, --docker-build or --npm-build to specify method)"
fi

# If SERVICE_PATH is set, create override file for local service build
if [ -n "$SERVICE_PATH" ] && [ ! -f "docker-compose.test.local.yml" ]; then
    OVERRIDE_FILE="docker-compose.test.local.yml"
    cat > "$OVERRIDE_FILE" <<EOF
services:
  bom-local-service:
    build:
      context: $SERVICE_PATH
      dockerfile: Dockerfile
    image: bom-local-service:local-test
EOF
fi

# Check if containers are already running
CONTAINERS_RUNNING=0
COMPOSE_FILES_CHECK="-f docker-compose.test.yml"
if [ -f "docker-compose.test.local.yml" ]; then
    COMPOSE_FILES_CHECK="$COMPOSE_FILES_CHECK -f docker-compose.test.local.yml"
fi
if docker compose $COMPOSE_FILES_CHECK ps 2>/dev/null | grep -q "Up" || \
   docker-compose $COMPOSE_FILES_CHECK ps 2>/dev/null | grep -q "Up"; then
    CONTAINERS_RUNNING=1
fi

# If containers are running, automatically update the card (no need for UPDATE_MODE)
if [ "$CONTAINERS_RUNNING" = "1" ]; then
    echo "🔄 Updating card in running test environment (preserving HA state)..."
    
    # Copy card file
    echo "📋 Updating card file..."
    mkdir -p test-ha/config/www
    
    # Copy file using Docker (containers run as root, so we use root to write)
    docker run --rm \
        -v "$(pwd)/dist/bom-local-radar-card.js:/source/bom-local-radar-card.js:ro" \
        -v "$(pwd)/test-ha/config/www:/dest:rw" \
        -u root \
        alpine:latest \
        sh -c "cp /source/bom-local-radar-card.js /dest/bom-local-radar-card.js && chmod 644 /dest/bom-local-radar-card.js" 2>/dev/null || {
        echo "❌ Error: Failed to copy card file"
        exit 1
    }
    echo "   ✅ Card file copied successfully"
    
    # Verify copy succeeded
    if [ ! -f "test-ha/config/www/bom-local-radar-card.js" ]; then
        echo "❌ Error: Failed to update card file"
        exit 1
    fi
    
    # Verify file sizes match
    SOURCE_SIZE=$(stat -f%z "dist/bom-local-radar-card.js" 2>/dev/null || stat -c%s "dist/bom-local-radar-card.js" 2>/dev/null)
    DEST_SIZE=$(stat -f%z "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null || stat -c%s "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null)
    if [ "$SOURCE_SIZE" != "$DEST_SIZE" ]; then
        echo "❌ Error: File sizes don't match after copy"
        exit 1
    fi
    
    # Verify file contains expected content (basic sanity check)
    if ! grep -q "resolveImageUrl\|BOM-LOCAL-RADAR-CARD" test-ha/config/www/bom-local-radar-card.js 2>/dev/null; then
        echo "   ⚠️  Warning: Card file may not be valid (missing expected content)"
    fi
    
    echo "✅ Card file updated (${SOURCE_SIZE} bytes)"
    
    # Copy configuration files to HA config directory (for dashboard changes)
    echo "📋 Updating HA configuration files..."
    for config_file in configuration.yaml ui-lovelace.yaml; do
        if [ -f "test-ha/$config_file" ]; then
            cp "test-ha/$config_file" "test-ha/config/$config_file"
            echo "   ✅ Updated $config_file"
        fi
    done
    
    # Restart HA to pick up changes
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE_CMD="docker-compose"
    else
        echo "❌ Error: docker compose not found"
        exit 1
    fi
    
    # Determine compose files to use (check if override exists)
    COMPOSE_FILES="-f docker-compose.test.yml"
    if [ -f "docker-compose.test.local.yml" ]; then
        COMPOSE_FILES="$COMPOSE_FILES -f docker-compose.test.local.yml"
    fi
    
    # If service path is specified, rebuild and restart the service
    if [ -n "$SERVICE_PATH" ]; then
        echo "🔨 Rebuilding service from local source: $SERVICE_PATH"
        
        # Ensure override file exists for local service build
        OVERRIDE_FILE="docker-compose.test.local.yml"
        if [ ! -f "$OVERRIDE_FILE" ]; then
            cat > "$OVERRIDE_FILE" <<EOF
services:
  bom-local-service:
    build:
      context: $SERVICE_PATH
      dockerfile: Dockerfile
    image: bom-local-service:local-test
EOF
        fi
        COMPOSE_FILES="$COMPOSE_FILES -f $OVERRIDE_FILE"
        
        # Rebuild service - Docker's cache will detect source file changes automatically
        # Only use --no-cache if explicitly needed (it's much slower)
        echo "   Building service image (Docker will detect code changes automatically)..."
        if $DOCKER_COMPOSE_CMD $COMPOSE_FILES build bom-local-service; then
            echo "   ✅ Service rebuilt successfully"
            
            echo "🔄 Restarting service container..."
            if $DOCKER_COMPOSE_CMD $COMPOSE_FILES up -d --no-deps bom-local-service; then
                echo "   ✅ Service restarted with latest code"
            else
                echo "   ❌ Error: Failed to restart service container"
                echo "   Check logs: docker logs bom-card-test-service"
                exit 1
            fi
        else
            echo "   ❌ Error: Service rebuild failed"
            echo "   Check the build output above for details"
            exit 1
        fi
    fi
    
    echo "🔄 Restarting Home Assistant to load updated card..."
    $DOCKER_COMPOSE_CMD $COMPOSE_FILES restart homeassistant
    
    # Check and restart the service if it's not running (it may have crashed)
    SERVICE_STATUS=$($DOCKER_COMPOSE_CMD $COMPOSE_FILES ps bom-local-service 2>/dev/null | grep -c "Up" || echo "0")
    if [ "$SERVICE_STATUS" = "0" ]; then
        echo "🔄 Restarting BOM service (was not running)..."
        $DOCKER_COMPOSE_CMD $COMPOSE_FILES restart bom-local-service || \
        $DOCKER_COMPOSE_CMD $COMPOSE_FILES up -d bom-local-service
        
        # Wait a moment and check if service started
        sleep 3
        if ! curl -s -f "http://localhost:${SERVICE_HOST_PORT}/api/radar/Brisbane/QLD" > /dev/null 2>&1; then
            echo "   ⚠️  Warning: BOM service may not be responding correctly"
            echo "   Check logs: docker logs bom-card-test-service"
        else
            echo "   ✅ Service is responding"
        fi
    fi
    
    echo "⏳ Waiting for Home Assistant to restart..."
    sleep 5
    
    MAX_WAIT=60
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if curl -s -f "http://localhost:${HA_HOST_PORT}" > /dev/null 2>&1; then
            echo "✅ Home Assistant restarted with updated card!"
            break
        fi
        sleep 2
        WAIT_COUNT=$((WAIT_COUNT + 2))
    done
    
    echo ""
    echo "✅ Card updated! Refresh your browser (Ctrl+F5) to see changes."
    exit 0
fi

# Normal mode - full setup (containers not running)
echo "🚀 Setting up fresh test environment..."
echo "🐳 Stopping any existing containers..."
# Clean up any existing override files
rm -f docker-compose.test.local.yml

# Determine compose files to use
COMPOSE_FILES_CLEAN="-f docker-compose.test.yml"
if [ -f "docker-compose.test.local.yml" ]; then
    COMPOSE_FILES_CLEAN="$COMPOSE_FILES_CLEAN -f docker-compose.test.local.yml"
fi

# Stop and remove containers (preserve volumes to keep cache)
docker compose $COMPOSE_FILES_CLEAN down 2>/dev/null || docker-compose $COMPOSE_FILES_CLEAN down 2>/dev/null || true

# Preserve .storage directory to keep user accounts and HA state
# Only create it if it doesn't exist
echo "📦 Ensuring test directories exist..."
mkdir -p test-ha/config/.storage
mkdir -p test-ha/config/www
mkdir -p test-ha/cache

# Ensure directories exist (Docker will create files as current user due to user: setting in compose)
# Copy built card file to www directory (for /local/ access in HA)
echo "📋 Copying card file to www directory..."
mkdir -p test-ha/config/www

# Check if update is needed by comparing file sizes and content
NEEDS_UPDATE=1
if [ -f "test-ha/config/www/bom-local-radar-card.js" ]; then
    SOURCE_SIZE=$(stat -f%z "dist/bom-local-radar-card.js" 2>/dev/null || stat -c%s "dist/bom-local-radar-card.js" 2>/dev/null)
    DEST_SIZE=$(stat -f%z "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null || stat -c%s "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null)
    
    # Check if sizes match and if the file contains expected content (resolveImageUrl function)
    if [ "$SOURCE_SIZE" = "$DEST_SIZE" ]; then
        # Check if file contains key function to verify it's the latest version
        if grep -q "resolveImageUrl" test-ha/config/www/bom-local-radar-card.js 2>/dev/null || \
           grep -q "Resolve relative image URLs" test-ha/config/www/bom-local-radar-card.js 2>/dev/null; then
            # File exists, sizes match, and contains expected content - may not need update
            # But we'll update anyway to be safe, or check modification time
            SOURCE_MTIME=$(stat -f%m "dist/bom-local-radar-card.js" 2>/dev/null || stat -c%Y "dist/bom-local-radar-card.js" 2>/dev/null)
            DEST_MTIME=$(stat -f%m "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null || stat -c%Y "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null)
            if [ "$SOURCE_MTIME" -le "$DEST_MTIME" ]; then
                NEEDS_UPDATE=0
            fi
        fi
    fi
fi

if [ "$NEEDS_UPDATE" = "1" ]; then
    # Copy file using Docker (containers run as root, so we use root to write)
    echo "   Copying file using Docker..."
    docker run --rm \
        -v "$(pwd)/dist/bom-local-radar-card.js:/source/bom-local-radar-card.js:ro" \
        -v "$(pwd)/test-ha/config/www:/dest:rw" \
        -u root \
        alpine:latest \
        sh -c "cp /source/bom-local-radar-card.js /dest/bom-local-radar-card.js && chmod 644 /dest/bom-local-radar-card.js" 2>/dev/null || {
        echo "❌ Error: Failed to copy card file"
        exit 1
    }
    echo "   ✅ Card file copied successfully"

    # Verify copy succeeded
    if [ ! -f "test-ha/config/www/bom-local-radar-card.js" ]; then
        echo "❌ Error: Failed to copy card file to www directory"
        exit 1
    fi

    # Verify file sizes match
    SOURCE_SIZE=$(stat -f%z "dist/bom-local-radar-card.js" 2>/dev/null || stat -c%s "dist/bom-local-radar-card.js" 2>/dev/null)
    DEST_SIZE=$(stat -f%z "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null || stat -c%s "test-ha/config/www/bom-local-radar-card.js" 2>/dev/null)
    if [ "$SOURCE_SIZE" != "$DEST_SIZE" ]; then
        echo "❌ Error: File sizes don't match after copy"
        exit 1
    fi

    # Verify file contains expected content (basic sanity check)
    if ! grep -q "resolveImageUrl\|BOM-LOCAL-RADAR-CARD" test-ha/config/www/bom-local-radar-card.js 2>/dev/null; then
        echo "   ⚠️  Warning: Card file may not be valid (missing expected content)"
    fi

    echo "✅ Card file copied successfully"
else
    echo "✅ Card file is up to date (skipping copy)"
fi

# Copy configuration files to HA config directory
echo "📋 Copying HA configuration files..."
for config_file in configuration.yaml ui-lovelace.yaml; do
    if [ ! -f "test-ha/$config_file" ]; then
        echo "   ⚠️  Warning: test-ha/$config_file not found, skipping..."
        continue
    fi
    cp "test-ha/$config_file" "test-ha/config/$config_file"
done

# Create onboarding bypass - skip everything EXCEPT user creation
# This way HA will prompt for user creation but skip other setup steps
# Only create if it doesn't exist (preserve existing state)
if [ ! -f "test-ha/config/.storage/onboarding" ]; then
    echo "📝 Creating onboarding bypass (first time setup)..."
    mkdir -p test-ha/config/.storage
    cat > test-ha/config/.storage/onboarding <<EOF
{
    "data": {
        "done": ["core_config", "integration"]
    },
    "key": "onboarding",
    "version": 3
}
EOF
else
    echo "✅ Preserving existing Home Assistant state (user accounts, settings, etc.)"
fi

# Try docker compose (newer) first, fallback to docker-compose (older)
# Define this early so it can be used for service builds
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo "❌ Error: docker compose or docker-compose not found"
    exit 1
fi

# Handle service build - either from local source or pre-built image
DOCKER_COMPOSE_FILES="-f docker-compose.test.yml"
if [ -n "$SERVICE_PATH" ]; then
    echo "🔨 Building service from local source: $SERVICE_PATH"
    
    # Create docker-compose override file for local service build
    OVERRIDE_FILE="docker-compose.test.local.yml"
    cat > "$OVERRIDE_FILE" <<EOF
services:
  bom-local-service:
    build:
      context: $SERVICE_PATH
      dockerfile: Dockerfile
    image: bom-local-service:local-test
    # Remove image specification when building
EOF
    
    DOCKER_COMPOSE_FILES="$DOCKER_COMPOSE_FILES -f $OVERRIDE_FILE"
    
    # Build service - Docker's cache will detect source file changes automatically
    # The Dockerfile is structured to cache dependencies, so only changed source files trigger rebuilds
    # This is much faster (~10-20s) than --no-cache (~100s) when only code changes
    echo "   Building service image (Docker will detect code changes automatically)..."
    if ! $DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES build bom-local-service; then
        echo "   ❌ Error: Service build failed"
        echo "   Check the build output above for details"
        exit 1
    fi
    echo "   ✅ Service built successfully"
else
    echo "🐳 Pulling latest service image..."
    if ! docker pull ghcr.io/alexhopeoconnor/bom-local-service:latest; then
        echo "   ⚠️  Warning: Failed to pull service image, will use cached version if available"
    else
        echo "   ✅ Service image pulled successfully"
    fi
fi

echo "🐳 Starting test environment..."
echo "   - BOM Local Service: http://localhost:${SERVICE_HOST_PORT}"
echo "   - Home Assistant: http://localhost:${HA_HOST_PORT}"
echo ""
echo "   On first access to HA, you'll be prompted to create a user account."
echo "   This is a one-time setup - the account persists across restarts."
echo ""
echo "   The service may take a minute to initialize on first run"
echo ""

# Start containers (use override file if building from local source)
$DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES up -d --build || {
    echo "❌ Error: Failed to start containers"
    cleanup
    exit 1
}

# Wait for containers to be running
echo "⏳ Waiting for containers to start..."
sleep 3

# Check if containers are running
if ! $DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES ps | grep -q "Up"; then
    echo "   ⚠️  Warning: Some containers may not be running. Check logs:"
    echo "   $DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES logs"
fi


# Wait for HA to be ready (check if port is responding)
echo "⏳ Waiting for Home Assistant to be ready..."
MAX_WAIT=120
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s -f "http://localhost:${HA_HOST_PORT}" > /dev/null 2>&1; then
        echo "✅ Home Assistant is ready!"
        break
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
    if [ $((WAIT_COUNT % 10)) -eq 0 ]; then
        echo "   Still waiting... (${WAIT_COUNT}s / ${MAX_WAIT}s)"
    fi
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo "   ⚠️  Warning: Home Assistant may not be fully ready yet"
    echo "   Check logs: $DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES logs homeassistant"
fi

echo ""
echo "✅ Test environment started!"
echo ""
echo "📋 Next steps:"
echo "   1. Open http://localhost:${HA_HOST_PORT} in your browser"
echo "   2. Create a user account (first time only)"
echo "   3. The test dashboard should be available with your custom card"
echo "   4. Check browser console (F12) for any errors"
echo ""
echo "🔧 Useful commands:"
echo "   View logs:     $DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES logs -f"
echo "   Stop:          $DOCKER_COMPOSE_CMD $DOCKER_COMPOSE_FILES down"
echo "   Clean restart: ./run.sh clean && ./scripts/test.sh"
echo "   Force rebuild: ./scripts/test.sh --force-build"
echo "   Docker build:  ./scripts/test.sh --docker-build"
echo "   NPM build:     ./scripts/test.sh --npm-build"
if [ -n "$SERVICE_PATH" ]; then
    echo "   Local service: ./scripts/test.sh --service-path $SERVICE_PATH"
fi
echo "   Help:          ./scripts/test.sh --help"
echo ""
