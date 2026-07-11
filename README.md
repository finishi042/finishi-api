# Finishi API

Shared Fastify API server for Finishi admin and user applications.

## Features

- **Fastify**: High-performance Node.js web framework
- **TypeScript**: Full type safety
- **Supabase**: Authentication and database
- **Role-based Access Control**: Admin and user roles
- **Cloud Run Ready**: Containerized deployment

## Project Structure

```
src/
├── server.ts           # Application entry point
├── routes/
│   ├── admin/          # Admin-only endpoints
│   ├── user/           # User endpoints
│   └── shared/         # Public/shared endpoints
├── plugins/
│   ├── supabase.ts     # Supabase client plugin
│   ├── auth.ts         # JWT authentication plugin
│   └── cors.ts         # CORS configuration
├── middleware/
│   ├── auth.ts         # Authentication middleware
│   └── rbac.ts         # Role-based access control
├── lib/
│   ├── supabase.ts     # Supabase utilities
│   └── types.ts        # Shared types
└── schemas/            # Zod validation schemas
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm or pnpm
- Supabase project

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

### Development

```bash
npm run dev
```

Server runs on `http://localhost:3000`

### Build

```bash
npm run build
npm start
```

## API Endpoints

### Health Check

```
GET /health
```

### Admin Routes

**Base**: `/api/v1/admin`

Requires: `Authorization: Bearer <token>` with admin role

```
GET    /users              # List all users
GET    /users/:id          # Get user details
POST   /users/:id/suspend  # Suspend a user
GET    /analytics          # Get platform analytics
POST   /content            # Create content
```

### User Routes

**Base**: `/api/v1/user`

Requires: `Authorization: Bearer <token>` with user role

```
GET    /profile            # Get current user profile
PUT    /profile            # Update profile
GET    /courses            # List available courses
POST   /courses/:id/enroll # Enroll in a course
GET    /progress           # Get learning progress
POST   /progress           # Update progress
```

## Authentication

The API uses Supabase JWT tokens for authentication:

1. Client authenticates with Supabase Auth
2. Client receives JWT token
3. Client includes token in API requests: `Authorization: Bearer <token>`
4. API validates token and extracts user role
5. RBAC middleware checks permissions

## Deployment

### Docker Build

```bash
docker build -t finishi-api .
docker run -p 3000:3000 --env-file .env finishi-api
```

### Google Cloud Run

```bash
# Build and push
gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/finishi-api/app:latest

# Deploy
gcloud run deploy finishi-api \
  --image us-central1-docker.pkg.dev/PROJECT_ID/finishi-api/app:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars SUPABASE_URL=...,SUPABASE_ANON_KEY=...,SUPABASE_SERVICE_ROLE_KEY=...,SUPABASE_JWT_SECRET=...
```

## Testing

```bash
# Health check
curl http://localhost:3000/health

# Test admin endpoint (requires token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/admin/users

# Test user endpoint (requires token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/user/profile
```

## License

Private
