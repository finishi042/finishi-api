#!/bin/bash

# Finishi API - Local Development Setup Script

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Finishi API - Local Setup ===${NC}"
echo ""

# Check Node.js version
echo -e "${YELLOW}Checking Node.js version...${NC}"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js 20 or higher is required${NC}"
    echo "Current version: $(node -v)"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Install dependencies
echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Check for .env file
echo ""
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ .env file exists${NC}"
else
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠ Please update .env with your Supabase credentials${NC}"
fi

# TypeScript check
echo ""
echo -e "${YELLOW}Running TypeScript check...${NC}"
npm run typecheck
echo -e "${GREEN}✓ TypeScript check passed${NC}"

# Build
echo ""
echo -e "${YELLOW}Building application...${NC}"
npm run build
echo -e "${GREEN}✓ Build successful${NC}"

# Instructions
echo ""
echo -e "${GREEN}=== Setup Complete! ===${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Update .env with your Supabase credentials:"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "   - SUPABASE_JWT_SECRET"
echo ""
echo "2. Start the development server:"
echo "   npm run dev"
echo ""
echo "3. Test the API:"
echo "   curl http://localhost:3000/health"
echo ""
echo "4. View documentation:"
echo "   - README.md - Getting started"
echo "   - ARCHITECTURE.md - System design"
echo "   - DEPLOYMENT.md - Cloud Run deployment"
echo ""
