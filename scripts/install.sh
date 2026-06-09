#!/bin/bash
# ISP-CRM VPS Full Installation Script
# Run as: bash /tmp/install.sh
export DEBIAN_FRONTEND=noninteractive

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[SETUP]${NC} $1"; }
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

# ─── 1. UFW Firewall ─────────────────────────────────────────────────────────
log "Configuring UFW firewall..."
sudo ufw --force reset 2>/dev/null
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    comment 'SSH'
sudo ufw allow 80/tcp    comment 'HTTP'
sudo ufw allow 443/tcp   comment 'HTTPS'
sudo ufw allow 1812/udp  comment 'RADIUS-Auth'
sudo ufw allow 1813/udp  comment 'RADIUS-Acct'
sudo ufw allow 4000/tcp  comment 'API'
sudo ufw allow 3000/tcp  comment 'Frontend'
sudo ufw --force enable
ok "UFW configured — ports 22/80/443/1812/1813 open"

# ─── 2. Fail2ban ─────────────────────────────────────────────────────────────
log "Configuring fail2ban..."
sudo tee /etc/fail2ban/jail.local > /dev/null << 'JAIL'
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
JAIL
sudo systemctl enable fail2ban --quiet 2>/dev/null
sudo systemctl restart fail2ban
ok "Fail2ban protecting SSH (3 attempts → 24h ban)"

# ─── 3. Docker Engine ────────────────────────────────────────────────────────
log "Installing Docker Engine..."
if command -v docker &> /dev/null; then
    ok "Docker already installed: $(docker --version)"
else
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo systemctl enable docker --quiet
    sudo systemctl start docker
    sudo usermod -aG docker fastx
    ok "Docker installed: $(docker --version)"
fi

# ─── 4. Directories ──────────────────────────────────────────────────────────
log "Setting up project directories..."
sudo mkdir -p /opt/isp-crm
sudo chown fastx:fastx /opt/isp-crm
sudo mkdir -p /backups
sudo chown fastx:fastx /backups
ok "Directories ready: /opt/isp-crm /backups"

# ─── 5. Node.js 20 ───────────────────────────────────────────────────────────
log "Installing Node.js 20..."
if command -v node &> /dev/null && node --version | grep -q 'v20\|v21\|v22'; then
    ok "Node.js already installed: $(node --version)"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
    sudo apt-get install -y -qq nodejs
    ok "Node.js installed: $(node --version)"
fi

echo ""
echo "================================================"
echo "  VPS BASE SETUP COMPLETE"
echo "  Docker:  $(docker --version)"
echo "  Node.js: $(node --version)"
echo "  UFW:     $(sudo ufw status | head -1)"
echo "================================================"
echo "INSTALL_COMPLETE"
