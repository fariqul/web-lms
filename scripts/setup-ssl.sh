#!/bin/bash
# ============================================
# SSL Setup Script for LMS SMA 15 Makassar
# Uses DuckDNS (free) + Let's Encrypt (free)
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== LMS SSL Setup ===${NC}"
echo ""

# Check if domain is provided
if [ -z "$1" ]; then
    echo -e "${RED}Usage: ./setup-ssl.sh <your-domain>${NC}"
    echo ""
    echo "Example: ./setup-ssl.sh sma15lms.duckdns.org"
    echo ""
    echo "Steps to get a free domain:"
    echo "1. Go to https://www.duckdns.org/"
    echo "2. Login with Google/GitHub/etc"
    echo "3. Create a subdomain (e.g., 'sma15lms')"
    echo "4. Set the IP to your EC2: 52.63.72.178"
    echo "5. Run this script: ./setup-ssl.sh sma15lms.duckdns.org"
    exit 1
fi

DOMAIN=$1
echo -e "Domain: ${YELLOW}${DOMAIN}${NC}"
echo ""

# Step 1: Install certbot
echo -e "${GREEN}[1/4] Installing certbot...${NC}"
if ! command -v certbot &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y certbot
    echo -e "${GREEN}certbot installed.${NC}"
else
    echo -e "${YELLOW}certbot already installed.${NC}"
fi

# Step 2: Stop nginx temporarily to free port 80 for certbot
echo -e "${GREEN}[2/4] Stopping nginx for certificate generation...${NC}"
docker compose stop nginx 2>/dev/null || true

# Step 3: Get SSL certificate
echo -e "${GREEN}[3/4] Requesting SSL certificate from Let's Encrypt...${NC}"
sudo certbot certonly --standalone \
    --agree-tos \
    --no-eff-email \
    --email admin@sma15makassar.sch.id \
    -d "$DOMAIN" \
    --cert-name lms

# Step 4: Create certbot directory for webroot renewals
echo -e "${GREEN}[4/4] Setting up auto-renewal...${NC}"
sudo mkdir -p /var/www/certbot

# Create renewal hook to restart nginx
sudo tee /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh > /dev/null << 'EOF'
#!/bin/bash
cd /home/ubuntu/web-lms
docker compose restart nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh

# Add cron job for auto-renewal (twice daily)
(sudo crontab -l 2>/dev/null | grep -v certbot; echo "0 3,15 * * * certbot renew --quiet") | sudo crontab -

echo ""
echo -e "${GREEN}=== SSL Setup Complete! ===${NC}"
echo ""
echo "Certificate location:"
echo "  /etc/letsencrypt/live/lms/fullchain.pem"
echo "  /etc/letsencrypt/live/lms/privkey.pem"
echo ""
echo -e "Now run:"
echo -e "  ${YELLOW}docker compose up -d${NC}"
echo ""
echo -e "Your WebSocket URL: ${GREEN}wss://${DOMAIN}/socket.io/${NC}"
echo -e "Set in Vercel env:  ${GREEN}NEXT_PUBLIC_SOCKET_URL=https://${DOMAIN}${NC}"
