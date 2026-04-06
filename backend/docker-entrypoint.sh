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
QUEUE_WORKERS=${QUEUE_WORKERS:-10}
QUEUE_SLEEP=${QUEUE_SLEEP:-1}
QUEUE_TRIES=${QUEUE_TRIES:-3}
QUEUE_MAX_TIME=${QUEUE_MAX_TIME:-300}
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

# Start multiple queue workers in background for async jobs (AI proctoring, etc.)
QUEUE_WORKERS_COUNT=${QUEUE_WORKERS:-10}
case "$QUEUE_WORKERS_COUNT" in
    ''|*[!0-9]*) QUEUE_WORKERS_COUNT=1 ;;
esac

if [ "$QUEUE_WORKERS_COUNT" -lt 1 ]; then
    QUEUE_WORKERS_COUNT=1
fi

i=1
while [ "$i" -le "$QUEUE_WORKERS_COUNT" ]; do
    php artisan queue:work database --sleep=${QUEUE_SLEEP:-1} --tries=${QUEUE_TRIES:-3} --max-time=${QUEUE_MAX_TIME:-300} --quiet &
    echo "Queue worker #$i started"
    i=$((i + 1))
done

echo "Total queue workers started: $QUEUE_WORKERS_COUNT"

# Start Apache
apache2-foreground
