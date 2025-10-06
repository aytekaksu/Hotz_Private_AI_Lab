#!/bin/bash

echo "=========================================="
echo "AI Assistant - Setup Verification"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_mark="${GREEN}✓${NC}"
cross_mark="${RED}✗${NC}"
warning_mark="${YELLOW}!${NC}"

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to check if a file exists
file_exists() {
  [ -f "$1" ]
}

# Function to check if a directory exists
dir_exists() {
  [ -d "$1" ]
}

echo "Checking prerequisites..."
echo ""

# Node.js
if command_exists node; then
  echo -e "${check_mark} Node.js installed: $(node --version)"
else
  echo -e "${cross_mark} Node.js not installed"
fi

# npm
if command_exists npm; then
  echo -e "${check_mark} npm installed: $(npm --version)"
else
  echo -e "${cross_mark} npm not installed"
fi

# Docker
if command_exists docker; then
  echo -e "${check_mark} Docker installed: $(docker --version | cut -d',' -f1)"
else
  echo -e "${cross_mark} Docker not installed"
fi

# Docker Compose
if docker compose version >/dev/null 2>&1; then
  echo -e "${check_mark} Docker Compose installed"
else
  echo -e "${cross_mark} Docker Compose not installed"
fi

echo ""
echo "Checking project structure..."
echo ""

# .env file
if file_exists ".env"; then
  echo -e "${check_mark} .env file exists"
  
  # Check for encryption keys
  if grep -q "APP_ENCRYPTION_KEY=.*[a-f0-9]\{64\}" .env; then
    echo -e "${check_mark} APP_ENCRYPTION_KEY is set"
  else
    echo -e "${warning_mark} APP_ENCRYPTION_KEY may not be properly set"
  fi
  
  if grep -q "N8N_ENCRYPTION_KEY=.*[a-f0-9]\{64\}" .env; then
    echo -e "${check_mark} N8N_ENCRYPTION_KEY is set"
  else
    echo -e "${warning_mark} N8N_ENCRYPTION_KEY may not be properly set"
  fi
  
  if grep -q "NEXTAUTH_SECRET=.*[a-f0-9]\{64\}" .env; then
    echo -e "${check_mark} NEXTAUTH_SECRET is set"
  else
    echo -e "${warning_mark} NEXTAUTH_SECRET may not be properly set"
  fi
else
  echo -e "${cross_mark} .env file not found (run ./scripts/setup.sh)"
fi

# Data directories
if dir_exists "data/sqlite"; then
  echo -e "${check_mark} data/sqlite directory exists"
else
  echo -e "${cross_mark} data/sqlite directory missing"
fi

if dir_exists "apps/n8n/data"; then
  echo -e "${check_mark} apps/n8n/data directory exists"
else
  echo -e "${cross_mark} apps/n8n/data directory missing"
fi

echo ""
echo "Checking application files..."
echo ""

# Check key application files
files_to_check=(
  "apps/web/package.json"
  "apps/web/app/page.tsx"
  "apps/web/app/api/chat/route.ts"
  "apps/web/lib/db/index.ts"
  "apps/web/lib/db/migrate.ts"
  "docker-compose.yml"
  "Caddyfile"
)

for file in "${files_to_check[@]}"; do
  if file_exists "$file"; then
    echo -e "${check_mark} $file"
  else
    echo -e "${cross_mark} $file missing"
  fi
done

echo ""
echo "Checking dependencies..."
echo ""

# Check if node_modules exists
if dir_exists "apps/web/node_modules"; then
  echo -e "${check_mark} Node modules installed"
else
  echo -e "${warning_mark} Node modules not installed (run: cd apps/web && npm install)"
fi

# Check database
if file_exists "data/sqlite/app.db"; then
  echo -e "${check_mark} Database initialized"
else
  echo -e "${warning_mark} Database not initialized (run: cd apps/web && npm run db:migrate)"
fi

echo ""
echo "=========================================="
echo "Verification Complete"
echo "=========================================="
echo ""

# Check if ready to run
if command_exists node && command_exists npm && file_exists ".env" && dir_exists "apps/web/node_modules" && file_exists "data/sqlite/app.db"; then
  echo -e "${GREEN}✓ System is ready to run!${NC}"
  echo ""
  echo "To start development server:"
  echo "  cd apps/web && npm run dev"
  echo ""
  echo "To start production with Docker:"
  echo "  docker compose up -d"
else
  echo -e "${YELLOW}⚠ System is not fully configured${NC}"
  echo ""
  echo "Next steps:"
  if ! command_exists node; then
    echo "  1. Install Node.js: sudo ./scripts/install-prerequisites.sh"
  fi
  if ! file_exists ".env"; then
    echo "  2. Run setup: ./scripts/setup.sh"
  fi
  if ! dir_exists "apps/web/node_modules"; then
    echo "  3. Install dependencies: cd apps/web && npm install"
  fi
  if ! file_exists "data/sqlite/app.db"; then
    echo "  4. Initialize database: cd apps/web && npm run db:migrate"
  fi
fi

echo ""


