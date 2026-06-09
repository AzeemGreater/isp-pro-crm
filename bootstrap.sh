#!/usr/bin/env bash
# =============================================================================
#  ISP-CRM VPS Bootstrap Script
#  Target OS : Ubuntu 24.04 LTS
#  Run once  : sudo bash bootstrap.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[BOOTSTRAP]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# --- 1. OS Update & Core Packages ---
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq ufw fail2ban curl wget htop net-tools gnupg ca-certificates lsb-release
ok "Core packages installed."

# --- 2. UFW Firewall ---
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
ufw allow 1812/udp  comment 'RADIUS Auth'
ufw allow 1813/udp  comment 'RADIUS Acct'
ufw --force enable
ok "UFW configured: 22/80/443 open, all else denied."

# --- 3. Fail2ban SSH Protection ---
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
backend  = %(sshd_backend)s
maxretry = 3
bantime  = 86400
EOF
systemctl enable fail2ban --quiet
systemctl restart fail2ban
ok "Fail2ban protecting SSH (3 attempts → 24h ban)."

# --- 4. Docker Engine ---
log "Installing Docker Engine..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker --quiet
systemctl start docker
ok "Docker Engine installed."

# --- 5. Project Directory ---
log "Creating /opt/isp-crm project directory..."
mkdir -p /opt/isp-crm
rsync -a --exclude='.git' "$(dirname "$0")/" /opt/isp-crm/
ok "Project synced to /opt/isp-crm."

# --- 6. Backups Directory ---
mkdir -p /backups
chmod 700 /backups
ok "Backup directory created at /backups."

# --- 7. Final Status ---
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  VPS Bootstrap Complete!                   ${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e "  UFW Status   : $(ufw status | head -1)"
echo -e "  Docker       : $(docker --version)"
echo -e "  Fail2ban     : $(fail2ban-client status | grep 'Number of jail')"
echo -e "  Next step    : cd /opt/isp-crm && cp .env.example .env && nano .env"
echo -e "${GREEN}============================================${NC}"
