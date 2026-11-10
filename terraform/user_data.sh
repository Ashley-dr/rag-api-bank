#!/bin/bash
set -euxo pipefail

apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg git ufw nginx certbot python3-certbot-nginx

# --- Docker Engine + Compose plugin (official Docker apt repo) ---
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

usermod -aG docker ubuntu

# --- Firewall ---
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw --force enable

# --- App directory ---
mkdir -p /opt/aspac_elearning
chown ubuntu:ubuntu /opt/aspac_elearning

# --- HTTPS: nginx reverse proxy to the app (port 3000) + free Let's Encrypt
# cert via a sslip.io hostname, so this works without owning a domain. ---
SSLIP_HOST="${sslip_hostname}"
LE_EMAIL="${letsencrypt_email}"

cat > /etc/nginx/sites-available/app <<NGINX
server {
    listen 80;
    server_name $SSLIP_HOST;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx

CERTBOT_ARGS=(--nginx -d "$SSLIP_HOST" -n --agree-tos --redirect)
if [ -n "$LE_EMAIL" ]; then
  CERTBOT_ARGS+=(-m "$LE_EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

# The Elastic IP is associated with this instance shortly after boot starts,
# so retry until the sslip.io hostname (which resolves to that IP) actually
# reaches this box for the HTTP-01 challenge.
for i in $(seq 1 30); do
  if certbot "$${CERTBOT_ARGS[@]}"; then
    echo "certbot: certificate issued for $SSLIP_HOST"
    break
  fi
  echo "certbot: attempt $i failed (Elastic IP may not be attached yet), retrying in 20s..."
  sleep 20
done
