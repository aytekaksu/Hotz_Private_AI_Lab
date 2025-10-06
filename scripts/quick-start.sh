#!/bin/bash
set -e

echo "=========================================="
echo "AI Assistant - Quick Start"
echo "=========================================="
echo ""

# Check if running from project root
if [ ! -f "package.json" ]; then
  echo "Error: Please run this script from the project root directory"
  exit 1
fi

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js is not installed"
  echo "Run: sudo ./scripts/install-prerequisites.sh"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ npm is not installed"
  exit 1
fi

echo "✓ Prerequisites OK"
echo ""

# Run setup if .env doesn't exist
if [ ! -f ".env" ]; then
  echo "Running initial setup..."
  ./scripts/setup.sh
fi

# Install dependencies if needed
if [ ! -d "apps/web/node_modules" ]; then
  echo "Installing dependencies..."
  cd apps/web
  npm install
  cd ../..
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

# Initialize database if needed
if [ ! -f "data/sqlite/app.db" ]; then
  echo ""
  echo "Initializing database..."
  cd apps/web
  npm run db:migrate
  cd ../..
  echo "✓ Database initialized"
else
  echo "✓ Database already initialized"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Starting development server..."
echo ""
echo "Access the application at: http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo ""
echo "Don't forget to:"
echo "  1. Get an OpenRouter API key from https://openrouter.ai/"
echo "  2. Add it in Settings (http://localhost:3000/settings)"
echo ""

cd apps/web
npm run dev



