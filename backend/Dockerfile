FROM php:8.2-apache

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    zip \
    unzip \
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd zip opcache \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Enable Apache modules
RUN a2enmod rewrite headers expires

# Copy optimized Apache MPM configuration for high concurrency
COPY apache-mpm.conf /etc/apache2/mods-available/mpm_prefork.conf

# PHP Production Settings (64GB RAM server)
RUN echo "upload_max_filesize = 100M" > /usr/local/etc/php/conf.d/production.ini \
    && echo "post_max_size = 100M" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "max_execution_time = 300" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "max_input_time = 300" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "memory_limit = 256M" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "max_input_vars = 5000" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "realpath_cache_size = 4096K" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "realpath_cache_ttl = 600" >> /usr/local/etc/php/conf.d/production.ini \
    && echo "session.gc_maxlifetime = 7200" >> /usr/local/etc/php/conf.d/production.ini

# PHP OPcache — Maximum Performance (per MySQL/PHP best practices 2024)
RUN echo "[opcache]" > /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.enable=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.enable_cli=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.memory_consumption=512" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.interned_strings_buffer=64" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.max_accelerated_files=30000" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.validate_timestamps=0" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.save_comments=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.fast_shutdown=1" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.jit=1255" >> /usr/local/etc/php/conf.d/opcache.ini \
    && echo "opcache.jit_buffer_size=256M" >> /usr/local/etc/php/conf.d/opcache.ini

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory
WORKDIR /var/www/html

# Copy project files
COPY . .

# Install PHP dependencies (optimized for production)
RUN composer install --optimize-autoloader --no-dev --no-interaction

# Create .env file from environment variables at runtime
RUN touch /var/www/html/.env

# Set permissions
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache /var/www/html/.env
RUN chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

# Configure Apache DocumentRoot
RUN sed -i 's|/var/www/html|/var/www/html/public|g' /etc/apache2/sites-available/000-default.conf
RUN sed -i 's|/var/www/html|/var/www/html/public|g' /etc/apache2/apache2.conf

# Allow .htaccess
RUN sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf

# Set ServerName to suppress warning
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Tune Apache KeepAlive for high concurrency
RUN echo "KeepAlive On" >> /etc/apache2/apache2.conf \
    && echo "MaxKeepAliveRequests 200" >> /etc/apache2/apache2.conf \
    && echo "KeepAliveTimeout 3" >> /etc/apache2/apache2.conf

# Expose port 80
EXPOSE 80

# Start script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

CMD ["docker-entrypoint.sh"]
