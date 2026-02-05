#!/bin/bash

# Create .env from environment variables if APP_KEY is set
if [ ! -z "$APP_KEY" ]; then
    echo "APP_KEY=$APP_KEY" > /var/www/html/.env
else
    # Generate new key if not provided
    touch /var/www/html/.env
    php artisan key:generate --force
fi

# Clear and cache config
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Run migrations (with error handling)
php artisan migrate --force || echo "Migration failed or already up to date"

# Start Apache
apache2-foreground
