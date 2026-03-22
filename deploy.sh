#!/bin/bash
# SmartField — Deploy to VPS
# SAFE: Does NOT touch InPrices or EuroComply360
#
# Usage: bash deploy.sh
#
# What this does:
#   1. Copies project to VPS at /home/deploy/smartfield
#   2. Builds Docker container (port 3002)
#   3. Adds nginx config for 3wwprotocol.com
#   4. Gets SSL certificate
#   5. Restarts nginx

set -e

VPS_USER="deploy"
VPS_HOST="87.106.178.187"
VPS_DIR="/home/deploy/smartfield"
DOMAIN="3wwprotocol.com"

echo "═══════════════════════════════════════"
echo "  SmartField Deploy to VPS"
echo "  Domain: $DOMAIN"
echo "  VPS: $VPS_HOST"
echo "═══════════════════════════════════════"
echo ""

# Step 1: Sync files to VPS
echo "[1/5] Syncing files to VPS..."
rsync -avz --exclude='node_modules' \
           --exclude='.smartfield' \
           --exclude='.licenses' \
           --exclude='.git' \
           --exclude='INTERNAL-MAP.md' \
           -e ssh \
           "$(dirname "$0")/" \
           "${VPS_USER}@${VPS_HOST}:${VPS_DIR}/"

# Step 2: Build and start container
echo "[2/5] Building Docker container..."
ssh "${VPS_USER}@${VPS_HOST}" "cd ${VPS_DIR} && docker compose build --no-cache && docker compose up -d"

# Step 3: Add nginx config
echo "[3/5] Adding nginx config for ${DOMAIN}..."
ssh "${VPS_USER}@${VPS_HOST}" "cat > /tmp/smartfield-nginx.conf << 'NGINX_EOF'
    # ── SmartField (3wwprotocol.com) ──
    server {
        listen 80;
        server_name ${DOMAIN} www.${DOMAIN};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    server {
        listen 443 ssl;
        server_name ${DOMAIN} www.${DOMAIN};

        ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

        location / {
            proxy_pass http://smartfield-app:3333;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }
NGINX_EOF
"

echo ""
echo "[3/5] MANUAL STEP NEEDED:"
echo "  SSH into the VPS and add the SmartField nginx config:"
echo ""
echo "  ssh ${VPS_USER}@${VPS_HOST}"
echo "  sudo nano /home/deploy/-eurocomply360/nginx/nginx.conf"
echo "  # Add the content from /tmp/smartfield-nginx.conf INSIDE the http {} block"
echo "  # BEFORE the closing '}' of the http block"
echo ""

# Step 4: SSL certificate
echo "[4/5] Getting SSL certificate..."
echo "  Run this on the VPS:"
echo ""
echo "  docker run --rm \\"
echo "    -v /home/deploy/-eurocomply360/certbot/conf:/etc/letsencrypt \\"
echo "    -v /home/deploy/-eurocomply360/certbot/www:/var/www/certbot \\"
echo "    certbot/certbot certonly --webroot \\"
echo "    --webroot-path=/var/www/certbot \\"
echo "    -d ${DOMAIN} -d www.${DOMAIN} \\"
echo "    --email hello@smartfield.dev --agree-tos --no-eff-email"
echo ""

# Step 5: Restart nginx
echo "[5/5] After SSL + nginx config, restart nginx:"
echo "  docker restart eurocomply360-nginx"
echo ""
echo "═══════════════════════════════════════"
echo "  Done! Site will be at: https://${DOMAIN}"
echo "═══════════════════════════════════════"
