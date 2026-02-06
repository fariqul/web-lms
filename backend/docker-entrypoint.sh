#!/bin/bash

# Create .env from environment variables
cat > /var/www/html/.env << EOF
APP_NAME="${APP_NAME:-LMS SMA 15 Makassar}"
APP_ENV="${APP_ENV:-production}"
APP_KEY=${APP_KEY}
APP_DEBUG=${APP_DEBUG:-false}
APP_URL=${APP_URL:-http://localhost}

LOG_CHANNEL=${LOG_CHANNEL:-stack}
LOG_LEVEL=${LOG_LEVEL:-error}

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

# Clear cache (after migration, so cache table exists)
php artisan cache:clear 2>/dev/null || true

# Start Apache
apache2-foreground
