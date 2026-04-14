#!/bin/bash

# Create .env from environment variables
cat > /var/www/html/.env << EOF
APP_NAME="${APP_NAME:-LMS SMA 15 Makassar}"
APP_ENV="${APP_ENV:-production}"
APP_KEY=${APP_KEY}
APP_DEBUG=${APP_DEBUG:-false}
APP_URL=${APP_URL:-http://localhost}

LOG_CHANNEL=${LOG_CHANNEL:-stack}
LOG_LEVEL=${LOG_LEVEL:-info}

DB_CONNECTION=${DB_CONNECTION:-mysql}
DB_HOST=${DB_HOST:-mysql}
DB_PORT=${DB_PORT:-3306}
DB_DATABASE=${DB_DATABASE:-lms}
DB_USERNAME=${DB_USERNAME:-root}
DB_PASSWORD=${DB_PASSWORD:-}

SESSION_DRIVER=${SESSION_DRIVER:-database}
SESSION_LIFETIME=${SESSION_LIFETIME:-120}
SESSION_DOMAIN=${SESSION_DOMAIN:-}
SESSION_SECURE_COOKIE=${SESSION_SECURE_COOKIE:-true}

SANCTUM_STATEFUL_DOMAINS=${SANCTUM_STATEFUL_DOMAINS:-localhost}

CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS:-http://localhost:3000}

FRONTEND_URL=${FRONTEND_URL:-https://web-lms-rowr.vercel.app}

SOCKET_SERVER_URL=${SOCKET_SERVER_URL:-http://socket:6001}
SOCKET_INTERNAL_SECRET=${SOCKET_INTERNAL_SECRET:-lms-socket-secret-key-2026}

QUEUE_CONNECTION=${QUEUE_CONNECTION:-database}
LOGIN_THROTTLE=${LOGIN_THROTTLE:-1800,1}
API_THROTTLE=${API_THROTTLE:-1400,1}
GLOBAL_API_THROTTLE=${GLOBAL_API_THROTTLE:-3500,1}
QUEUE_WORKERS=${QUEUE_WORKERS:-}
QUEUE_WORKERS_DEFAULT=${QUEUE_WORKERS_DEFAULT:-}
QUEUE_WORKERS_PROCTORING=${QUEUE_WORKERS_PROCTORING:-}
QUEUE_SLEEP=${QUEUE_SLEEP:-1}
QUEUE_TRIES=${QUEUE_TRIES:-3}
QUEUE_MAX_TIME=${QUEUE_MAX_TIME:-600}
EXAM_SYNC_LOAD_LOW_MAX=${EXAM_SYNC_LOAD_LOW_MAX:-99}
EXAM_SYNC_LOAD_MEDIUM_MAX=${EXAM_SYNC_LOAD_MEDIUM_MAX:-300}
PROCTORING_SERVICE_URL=${PROCTORING_SERVICE_URL:-http://proctoring:8001}

CLOUDINARY_URL=${CLOUDINARY_URL:-}
CLOUDINARY_CLOUD_NAME=${CLOUDINARY_CLOUD_NAME:-}
CLOUDINARY_API_KEY=${CLOUDINARY_API_KEY:-}
CLOUDINARY_API_SECRET=${CLOUDINARY_API_SECRET:-}
EOF

echo ".env file created successfully"
cat /var/www/html/.env

# Generate key if not provided
if [ -z "$APP_KEY" ]; then
    php artisan key:generate --force
fi

# Clear config caches (before migration)
php artisan config:clear
php artisan route:clear
php artisan view:clear

# Run migrations
php artisan migrate --force || echo "Migration failed or already up to date"

# Create storage symlink (public/storage -> storage/app/public)
php artisan storage:link 2>/dev/null || true

# Clear cache (after migration, so cache table exists)
php artisan cache:clear 2>/dev/null || true

# Cache config, routes, and views for production performance
# This avoids re-parsing files on every request (critical for 300+ concurrent users)
php artisan config:cache
php artisan route:cache
php artisan view:cache
echo "Production caches built successfully"

# Start queue workers in separate pools to isolate proctoring load.
# Backward compatibility:
# - If only legacy QUEUE_WORKERS is set, split it into default/proctoring so proctoring jobs never stall.
# - If new vars are provided, use split pools.
# - If none are provided, use tuned defaults for 600-student profile.
LEGACY_QUEUE_WORKERS=${QUEUE_WORKERS:-}

if [ -n "${QUEUE_WORKERS_DEFAULT:-}" ] || [ -n "${QUEUE_WORKERS_PROCTORING:-}" ]; then
    QUEUE_WORKERS_DEFAULT_COUNT=${QUEUE_WORKERS_DEFAULT:-6}
    QUEUE_WORKERS_PROCTORING_COUNT=${QUEUE_WORKERS_PROCTORING:-12}
elif [ -n "${LEGACY_QUEUE_WORKERS}" ]; then
    case "$LEGACY_QUEUE_WORKERS" in
        ''|*[!0-9]*)
            LEGACY_QUEUE_WORKERS=1
            ;;
    esac

    if [ "${LEGACY_QUEUE_WORKERS}" -le 1 ]; then
        QUEUE_WORKERS_DEFAULT_COUNT=1
        QUEUE_WORKERS_PROCTORING_COUNT=1
    else
        QUEUE_WORKERS_PROCTORING_COUNT=$((LEGACY_QUEUE_WORKERS / 2))
        QUEUE_WORKERS_DEFAULT_COUNT=$((LEGACY_QUEUE_WORKERS - QUEUE_WORKERS_PROCTORING_COUNT))
    fi
else
    QUEUE_WORKERS_DEFAULT_COUNT=6
    QUEUE_WORKERS_PROCTORING_COUNT=12
fi

sanitize_worker_count() {
    local worker_count="$1"
    local min_count="${2:-1}"
    case "$worker_count" in
        ''|*[!0-9]*)
            echo "$min_count"
            return
            ;;
    esac

    if [ "$worker_count" -lt "$min_count" ]; then
        echo "$min_count"
        return
    fi

    echo "$worker_count"
}

start_workers() {
    local queue_name="$1"
    local worker_count="$2"
    local i=1
    local worker_index

    if [ "$worker_count" -lt 1 ]; then
        echo "Queue worker ${queue_name} skipped (count=0)"
        return
    fi

    while [ "$i" -le "$worker_count" ]; do
        worker_index="$i"
        (
            while true; do
                if [ "$QUEUE_MAX_TIME_EFFECTIVE" -gt 0 ]; then
                    php artisan queue:work database --queue="${queue_name}" --sleep=${QUEUE_SLEEP:-1} --tries=${QUEUE_TRIES:-3} --max-time=${QUEUE_MAX_TIME_EFFECTIVE} --quiet
                else
                    php artisan queue:work database --queue="${queue_name}" --sleep=${QUEUE_SLEEP:-1} --tries=${QUEUE_TRIES:-3} --quiet
                fi

                exit_code=$?
                echo "Queue worker ${queue_name} #${worker_index} exited (code=${exit_code}), restarting in 2s"
                sleep 2
            done
        ) &
        echo "Queue worker ${queue_name} #$i started"
        i=$((i + 1))
    done
}

QUEUE_WORKERS_DEFAULT_COUNT=$(sanitize_worker_count "$QUEUE_WORKERS_DEFAULT_COUNT" 1)
QUEUE_WORKERS_PROCTORING_COUNT=$(sanitize_worker_count "$QUEUE_WORKERS_PROCTORING_COUNT" 1)
QUEUE_MAX_TIME_EFFECTIVE=$(sanitize_worker_count "${QUEUE_MAX_TIME:-0}" 0)

start_workers "default" "$QUEUE_WORKERS_DEFAULT_COUNT"
start_workers "proctoring" "$QUEUE_WORKERS_PROCTORING_COUNT"

echo "Total queue workers started: default=${QUEUE_WORKERS_DEFAULT_COUNT}, proctoring=${QUEUE_WORKERS_PROCTORING_COUNT}"

# Start Apache
apache2-foreground
