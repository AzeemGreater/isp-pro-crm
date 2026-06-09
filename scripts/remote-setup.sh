#!/usr/bin/env bash
# =============================================================================
#  ISP-CRM Remote Setup Script — Runs on Ubuntu 24.04 VPS
#  Installs: Docker, docker-compose, copies project, starts all containers
# =============================================================================
set -euo pipefail
SUDO="echo fastx | sudo -S"

echo "============================================"
echo "  ISP-CRM VPS Setup — $(date)"
echo "============================================"

# ─── Step 1: System update & core packages ───────────────────────────────────
echo "[1/8] Updating system packages..."
echo fastx | sudo -S apt-get update -qq
echo fastx | sudo -S apt-get upgrade -y -qq 2>/dev/null
echo fastx | sudo -S apt-get install -y -qq \
    ufw fail2ban curl wget htop net-tools gnupg ca-certificates \
    lsb-release git rsync unzip apt-transport-https software-properties-common
echo "  [OK] Packages installed"

# ─── Step 2: UFW Firewall ────────────────────────────────────────────────────
echo "[2/8] Configuring UFW firewall..."
echo fastx | sudo -S ufw --force reset 2>/dev/null
echo fastx | sudo -S ufw default deny incoming
echo fastx | sudo -S ufw default allow outgoing
echo fastx | sudo -S ufw allow 22/tcp    comment 'SSH'
echo fastx | sudo -S ufw allow 80/tcp    comment 'HTTP'
echo fastx | sudo -S ufw allow 443/tcp   comment 'HTTPS'
echo fastx | sudo -S ufw allow 1812/udp  comment 'RADIUS-Auth'
echo fastx | sudo -S ufw allow 1813/udp  comment 'RADIUS-Acct'
echo fastx | sudo -S ufw allow 4000/tcp  comment 'API-dev'
echo fastx | sudo -S ufw allow 3000/tcp  comment 'Frontend-dev'
echo fastx | sudo -S ufw --force enable
echo "  [OK] UFW configured"

# ─── Step 3: Fail2ban ────────────────────────────────────────────────────────
echo "[3/8] Configuring fail2ban..."
cat << 'EOF' | echo fastx | sudo -S tee /etc/fail2ban/jail.local > /dev/null
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
echo fastx | sudo -S systemctl enable fail2ban --quiet 2>/dev/null
echo fastx | sudo -S systemctl restart fail2ban
echo "  [OK] Fail2ban configured"

# ─── Step 4: Docker Engine ───────────────────────────────────────────────────
echo "[4/8] Installing Docker Engine..."
if ! command -v docker &> /dev/null; then
    echo fastx | sudo -S install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        echo fastx | sudo -S gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo fastx | sudo -S chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
        echo fastx | sudo -S tee /etc/apt/sources.list.d/docker.list > /dev/null
    echo fastx | sudo -S apt-get update -qq
    echo fastx | sudo -S apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    echo fastx | sudo -S systemctl enable docker --quiet
    echo fastx | sudo -S systemctl start docker
    echo fastx | sudo -S usermod -aG docker fastx
    echo "  [OK] Docker installed"
else
    echo "  [SKIP] Docker already installed: $(docker --version)"
fi

# ─── Step 5: Project directory ───────────────────────────────────────────────
echo "[5/8] Setting up project directory..."
echo fastx | sudo -S mkdir -p /opt/isp-crm
echo fastx | sudo -S chown fastx:fastx /opt/isp-crm
mkdir -p /opt/isp-crm
echo "  [OK] /opt/isp-crm ready"

# ─── Step 6: Backup directory ────────────────────────────────────────────────
echo "[6/8] Creating backup directory..."
echo fastx | sudo -S mkdir -p /backups
echo fastx | sudo -S chown fastx:fastx /backups
echo "  [OK] /backups ready"

echo "============================================"
echo "  Base setup COMPLETE!"
echo "  Next: rsync project files then run docker compose"
echo "============================================"
echo "SETUP_DONE"
