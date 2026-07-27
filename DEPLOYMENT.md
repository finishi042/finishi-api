# Finishi API - Cloud Run Deployment Guide

Complete guide for deploying the Finishi API to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **Docker** (optional, Cloud Build handles this)
4. **Supabase Project** with database and auth configured

## Quick Deployment

### 1. Set Environment Variables

```bash
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_ANON_KEY='your-anon-key'
export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
export SUPABASE_JWT_SECRET='your-jwt-secret'
export ALLOWED_ORIGINS='https://admin.finishi.org,https://user.finishi.org'
```

### 2. Run Deployment Script

```bash
./deploy.sh [project-id] [region]
```

Example:
```bash
./deploy.sh finishi-prod us-central1
```

## Manual Deployment

### Step 1: Enable Required APIs

```bash
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com
```

### Step 2: Create Artifact Registry Repository

```bash
gcloud artifacts repositories create finishi-api \
    --repository-format=docker \
    --location=us-central1 \
    --description="Finishi API container images"
```

### Step 3: Build and Push Docker Image

```bash
# Build locally
docker build -t us-central1-docker.pkg.dev/finishi-prod/finishi-api/app:latest .

# Or use Cloud Build
gcloud builds submit --tag us-central1-docker.pkg.dev/finishi-prod/finishi-api/app:latest
```

### Step 4: Deploy to Cloud Run

```bash
gcloud run deploy finishi-api \
  --image us-central1-docker.pkg.dev/finishi-prod/finishi-api/app:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 60s \
  --set-env-vars NODE_ENV=production,PORT=3000 \
  --set-env-vars SUPABASE_URL=$SUPABASE_URL \
  --set-env-vars SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
  --set-env-vars SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
  --set-env-vars SUPABASE_JWT_SECRET=$SUPABASE_JWT_SECRET \
  --set-env-vars ALLOWED_ORIGINS=$ALLOWED_ORIGINS
```

## Environment Variables

Required environment variables for Cloud Run:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `LOG_LEVEL` | Logging level | `info` |
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJhbGc...` |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification | `your-secret` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `https://admin.finishi.org,https://user.finishi.org` |

## Configuration Options

### Resource Allocation

- **Memory**: 512Mi (adjust based on load)
- **CPU**: 1 vCPU (adjust based on load)
- **Min Instances**: 0 (scales to zero)
- **Max Instances**: 10 (prevents runaway costs)
- **Timeout**: 60s

### Scaling

Cloud Run automatically scales based on:
- Incoming request volume
- CPU and memory utilization
- Configured min/max instances

To adjust scaling:

```bash
gcloud run services update finishi-api \
  --min-instances 1 \
  --max-instances 20 \
  --region us-central1
```

### Custom Domain

1. **Map custom domain**:
```bash
gcloud run domain-mappings create \
  --service finishi-api \
  --domain api.finishi.app \
  --region us-central1
```

2. **Add DNS records** as shown in the output

## Monitoring

### View Logs

```bash
# Recent logs
gcloud run services logs read finishi-api \
  --region us-central1 \
  --limit 50

# Tail logs
gcloud run services logs tail finishi-api \
  --region us-central1
```

### Health Checks

```bash
# Check service health
curl https://finishi-api-xxx.run.app/health

# Check database connection
curl https://finishi-api-xxx.run.app/ready
```

### Metrics

View metrics in Cloud Console:
- **Requests**: Request count and latency
- **CPU**: CPU utilization
- **Memory**: Memory usage
- **Errors**: Error rate and 5xx responses

## Continuous Deployment

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - id: auth
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - name: Deploy to Cloud Run
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          service: finishi-api
          region: us-central1
          source: ./
          env_vars: |
            NODE_ENV=production
            SUPABASE_URL=${{ secrets.SUPABASE_URL }}
            SUPABASE_ANON_KEY=${{ secrets.SUPABASE_ANON_KEY }}
            SUPABASE_SERVICE_ROLE_KEY=${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
            SUPABASE_JWT_SECRET=${{ secrets.SUPABASE_JWT_SECRET }}
            ALLOWED_ORIGINS=${{ secrets.ALLOWED_ORIGINS }}
```

## Troubleshooting

### Service Won't Start

1. Check logs for errors:
```bash
gcloud run services logs read finishi-api --region us-central1 --limit 100
```

2. Verify environment variables:
```bash
gcloud run services describe finishi-api --region us-central1 --format yaml
```

### Connection Issues

1. Verify CORS settings match frontend origins
2. Check Supabase credentials are correct
3. Ensure service allows unauthenticated requests (for public endpoints)

### Performance Issues

1. Increase memory/CPU allocation
2. Increase min instances to reduce cold starts
3. Review database query performance
4. Enable request caching where appropriate

## Costs

Estimated Cloud Run costs (us-central1):
- **Requests**: $0.40 per million requests
- **CPU**: $0.00002400 per vCPU-second
- **Memory**: $0.00000250 per GiB-second
- **Free tier**: 2 million requests/month

With moderate usage (100k requests/month):
- ~$5-10/month

## Security

### Best Practices

1. **Use secrets management** for sensitive values
2. **Enable VPC connector** for private database access
3. **Implement rate limiting** in the API
4. **Monitor logs** for suspicious activity
5. **Keep dependencies updated**

### Secrets with Secret Manager

```bash
# Store secret
echo -n "your-secret-value" | gcloud secrets create supabase-jwt-secret --data-file=-

# Use in Cloud Run
gcloud run services update finishi-api \
  --update-secrets SUPABASE_JWT_SECRET=supabase-jwt-secret:latest \
  --region us-central1
```

## Rollback

If a deployment fails, rollback to previous revision:

```bash
# List revisions
gcloud run revisions list --service finishi-api --region us-central1

# Rollback
gcloud run services update-traffic finishi-api \
  --to-revisions finishi-api-00001-abc=100 \
  --region us-central1
```

## Support

For issues or questions:
- Check logs: `gcloud run services logs read finishi-api --region us-central1`
- Review [Cloud Run documentation](https://cloud.google.com/run/docs)
- Contact team support
