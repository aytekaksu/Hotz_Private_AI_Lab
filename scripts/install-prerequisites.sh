#!/bin/bash
set -e

echo "=========================================="
echo "Installing Prerequisites for AI Assistant"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "Updating system packages..."
apt-get update

# Install Node.js 20
echo ""
echo "Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  echo "✓ Node.js installed: $(node --version)"
else
  echo "✓ Node.js already installed: $(node --version)"
fi

# Install Docker
echo ""
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm /tmp/get-docker.sh
  echo "✓ Docker installed: $(docker --version)"
else
  echo "✓ Docker already installed: $(docker --version)"
fi

# Install Docker Compose
echo ""
echo "Installing Docker Compose plugin..."
if ! docker compose version &> /dev/null; then
  apt-get install -y docker-compose-plugin
  echo "✓ Docker Compose installed: $(docker compose version)"
else
  echo "✓ Docker Compose already installed: $(docker compose version)"
fi

# Install SQLite3
echo ""
echo "Installing SQLite3..."
if ! command -v sqlite3 &> /dev/null; then
  apt-get install -y sqlite3
  echo "✓ SQLite3 installed: $(sqlite3 --version)"
else
  echo "✓ SQLite3 already installed: $(sqlite3 --version)"
fi

# Install other useful tools
echo ""
echo "Installing additional tools..."
apt-get install -y curl wget git build-essential python3

# Add current user to docker group (if not root)
if [ -n "$SUDO_USER" ]; then
  echo ""
  echo "Adding $SUDO_USER to docker group..."
  usermod -aG docker $SUDO_USER
  echo "✓ User added to docker group (logout/login required for effect)"
fi

echo ""
echo "=========================================="
echo "Prerequisites Installation Complete!"
echo "=========================================="
echo ""
echo "Installed:"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - Docker: $(docker --version)"
echo "  - Docker Compose: $(docker compose version | head -n1)"
echo "  - SQLite3: $(sqlite3 --version | head -n1)"
echo ""
echo "Next steps:"
echo "1. If you were added to docker group, logout and login again"
echo "2. Run: cd /root/Hotz_AI_Lab && ./scripts/setup.sh"
echo "3. Run: cd /root/Hotz_AI_Lab/apps/web && npm install"
echo "4. Run: cd /root/Hotz_AI_Lab/apps/web && npm run db:migrate"
echo "5. Run: cd /root/Hotz_AI_Lab/apps/web && npm run dev"
echo ""



