#!/bin/bash

# Finishi API - Cloud Run Deployment Script
# Usage: ./deploy.sh [project-id] [region]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
PROJECT_ID="${1:-finishi-waitlist}"
REGION="${2:-us-central1}"
SERVICE_NAME="finishi-api"
REPOSITORY_NAME="finishi-api"

echo -e "${GREEN}=== Finishi API - Cloud Run Deployment ===${NC}"
echo ""
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo -e "${YELLOW}Setting GCP project...${NC}"
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    --quiet

# Create Artifact Registry repository if it doesn't exist
echo -e "${YELLOW}Creating Artifact Registry repository...${NC}"
gcloud artifacts repositories create "$REPOSITORY_NAME" \
    --repository-format=docker \
    --location="$REGION" \
    --description="Finishi API container images" \
    --quiet 2>/dev/null || echo "Repository already exists"

# Build and push image
IMAGE_URL="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY_NAME/$SERVICE_NAME:latest"

echo -e "${YELLOW}Building and pushing Docker image...${NC}"
gcloud builds submit \
    --tag "$IMAGE_URL" \
    --timeout=10m \
    .

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"

# Check if environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}Warning: Environment variables not set!${NC}"
    echo "Please set the following before deployment:"
    echo "  export SUPABASE_URL='your-supabase-url'"
    echo "  export SUPABASE_ANON_KEY='your-anon-key'"
    echo "  export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'"
    echo "  export SUPABASE_JWT_SECRET='your-jwt-secret'"
    echo "  export ALLOWED_ORIGINS='https://admin.finishi.app,https://app.finishi.app'"
    echo ""
    read -p "Continue with deployment? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_URL" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --timeout 60s \
    --set-env-vars "NODE_ENV=production,PORT=3000,LOG_LEVEL=info" \
    --set-env-vars "SUPABASE_URL=${SUPABASE_URL}" \
    --set-env-vars "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" \
    --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}" \
    --set-env-vars "SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}" \
    --set-env-vars "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" \
    --quiet

# Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform managed \
    --region "$REGION" \
    --format 'value(status.url)')

echo ""
echo -e "${GREEN}=== Deployment Complete! ===${NC}"
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "Test the deployment:"
echo "  curl $SERVICE_URL/health"
echo ""
echo "View logs:"
echo "  gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
echo ""
