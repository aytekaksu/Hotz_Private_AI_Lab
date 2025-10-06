#!/bin/bash
set -e

echo "=========================================="
echo "AI Assistant - Initial Setup"
echo "=========================================="
echo ""

# Check if .env exists
if [ -f .env ]; then
  echo "⚠️  .env file already exists. Skipping generation."
  read -p "Do you want to regenerate encryption keys? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Setup cancelled."
    exit 0
  fi
fi

# Copy .env.example to .env
echo "Creating .env file..."
cp .env.example .env

# Generate encryption keys
echo ""
echo "Generating encryption keys..."
APP_KEY=$(openssl rand -hex 32)
N8N_KEY=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)

# Update .env file with generated keys
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s/APP_ENCRYPTION_KEY=.*/APP_ENCRYPTION_KEY=${APP_KEY}/" .env
  sed -i '' "s/N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=${N8N_KEY}/" .env
  sed -i '' "s/NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=${AUTH_SECRET}/" .env
else
  # Linux
  sed -i "s/APP_ENCRYPTION_KEY=.*/APP_ENCRYPTION_KEY=${APP_KEY}/" .env
  sed -i "s/N8N_ENCRYPTION_KEY=.*/N8N_ENCRYPTION_KEY=${N8N_KEY}/" .env
  sed -i "s/NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=${AUTH_SECRET}/" .env
fi

echo "✓ Encryption keys generated"

# Create necessary directories
echo ""
echo "Creating data directories..."
mkdir -p data/sqlite
mkdir -p data/caddy/data
mkdir -p data/caddy/config
mkdir -p data/redis
mkdir -p apps/n8n/data

echo "✓ Directories created"

# Make scripts executable
echo ""
echo "Setting script permissions..."
chmod +x scripts/*.sh

echo "✓ Scripts are executable"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file and add:"
echo "   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
echo "   - NOTION_CLIENT_ID and NOTION_CLIENT_SECRET"
echo "   - CLOUDFLARE_API_TOKEN (if using Cloudflare DNS)"
echo "   - INTERNAL_DOMAIN (your internal domain name)"
echo ""
echo "2. Install dependencies:"
echo "   cd apps/web && npm install"
echo ""
echo "3. Run database migration:"
echo "   cd apps/web && npm run db:migrate"
echo ""
echo "4. Start services:"
echo "   docker compose up -d"
echo ""
echo "Or for development:"
echo "   cd apps/web && npm run dev"
echo ""



