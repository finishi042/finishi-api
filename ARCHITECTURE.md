# Finishi API - Architecture Overview

## System Design

The Finishi API is a shared backend service built with Fastify that serves both the admin dashboard and user application. It provides RESTful endpoints for user management, course access, and learning progress tracking.

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Fastify 5.x (high-performance web framework)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth + JWT
- **Deployment**: Google Cloud Run (containerized)
- **Logging**: Pino (structured logging)

## Architecture Diagram

```
┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │
│  Admin Dashboard│         │  User Dashboard │
│  (React SPA)    │         │  (React SPA)    │
│                 │         │                 │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │   HTTPS + JWT Token       │
         │                           │
         └────────┬──────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │                │
         │  Finishi API   │
         │  (Fastify)     │
         │                │
         └────────┬───────┘
                  │
                  │ Supabase Client
                  │
                  ▼
         ┌────────────────┐
         │                │
         │    Supabase    │
         │  (PostgreSQL)  │
         │                │
         └────────────────┘
```

## Project Structure

```
finishi-api/
├── src/
│   ├── server.ts              # Application entry point
│   ├── lib/
│   │   ├── types.ts           # Shared TypeScript types
│   │   └── supabase.ts        # Supabase utilities
│   ├── plugins/
│   │   ├── supabase.ts        # Supabase client plugin
│   │   ├── auth.ts            # JWT authentication
│   │   └── cors.ts            # CORS configuration
│   ├── middleware/
│   │   ├── auth.ts            # Authentication middleware
│   │   └── rbac.ts            # Role-based access control
│   ├── routes/
│   │   ├── shared/
│   │   │   └── health.ts      # Health check endpoints
│   │   ├── admin/
│   │   │   ├── users.ts       # User management
│   │   │   └── analytics.ts   # Platform analytics
│   │   └── user/
│   │       ├── profile.ts     # User profile
│   │       ├── courses.ts     # Course catalog
│   │       └── progress.ts    # Learning progress
│   └── schemas/               # Validation schemas (future)
├── Dockerfile                 # Multi-stage production build
├── deploy.sh                  # Cloud Run deployment script
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
└── README.md                  # Getting started guide
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (service status) |
| `GET` | `/ready` | Readiness check (database connection) |

### Admin Endpoints

**Base URL**: `/api/v1/admin`  
**Authorization**: Bearer token with `admin` role

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users` | List all users (paginated) |
| `GET` | `/users/:id` | Get user details |
| `POST` | `/users/:id/suspend` | Suspend user account |
| `DELETE` | `/users/:id` | Delete user account |
| `GET` | `/analytics` | Get platform analytics |

### User Endpoints

**Base URL**: `/api/v1/user`  
**Authorization**: Bearer token with `user` role (admin also has access)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/profile` | Get current user profile |
| `PUT` | `/profile` | Update user profile |
| `GET` | `/courses` | List available courses |
| `GET` | `/courses/:id` | Get course details |
| `POST` | `/courses/:id/enroll` | Enroll in course |
| `GET` | `/courses/enrolled` | Get enrolled courses |
| `GET` | `/progress` | Get all learning progress |
| `GET` | `/progress/:courseId` | Get course-specific progress |
| `POST` | `/progress` | Update learning progress |

## Authentication Flow

```
1. User logs in via Supabase Auth (client-side)
   ↓
2. Client receives JWT token
   ↓
3. Client includes token in API requests:
   Authorization: Bearer <jwt_token>
   ↓
4. API validates token with Supabase
   ↓
5. API extracts user info and role
   ↓
6. RBAC middleware checks permissions
   ↓
7. Request proceeds or returns 403 Forbidden
```

### Token Validation

- Tokens are validated using Supabase's JWT secret
- User information is extracted from the token payload
- Role is determined from `app_metadata.role` or `user_metadata.role`
- Default role is `user` if not specified

### Role Hierarchy

- **Admin**: Full access to all endpoints
- **User**: Access to user endpoints + own data only

## Database Schema

The API expects the following Supabase tables:

### `users` Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user', -- 'admin' or 'user'
  suspended BOOLEAN DEFAULT false,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `courses` Table

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  duration_minutes INTEGER,
  level TEXT, -- 'beginner', 'intermediate', 'advanced'
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `enrollments` Table

```sql
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);
```

### `progress` Table

```sql
CREATE TABLE progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  completed_lessons TEXT[] DEFAULT '{}',
  progress_percentage INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);
```

## Security Features

### Authentication & Authorization

- JWT token validation on all protected routes
- Role-based access control (RBAC)
- Supabase Row Level Security (RLS) for database access

### CORS

- Configurable allowed origins
- Credentials support enabled
- Restricted HTTP methods

### Input Validation

- Request validation using Fastify schemas (future enhancement)
- Type safety with TypeScript
- SQL injection prevention via Supabase client

### Rate Limiting

*(To be implemented)*

- Per-IP rate limiting
- Per-user rate limiting
- Endpoint-specific limits

## Performance Optimization

### Caching Strategy

*(To be implemented)*

- Response caching for read-heavy endpoints
- Redis integration for session management
- CDN caching for static responses

### Database Optimization

- Indexed columns for frequent queries
- Pagination for large result sets
- Connection pooling via Supabase

### Cold Start Mitigation

- Lightweight container image (~50MB)
- Minimal dependencies
- Cloud Run min instances setting

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "code": "ERROR_CODE"
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

## Monitoring & Logging

### Structured Logging

All logs use Pino with structured JSON format:

```json
{
  "level": "info",
  "time": 1234567890,
  "pid": 1234,
  "hostname": "container-xyz",
  "reqId": "abc-123",
  "msg": "Request completed",
  "responseTime": 45
}
```

### Key Metrics

- Request latency (p50, p95, p99)
- Error rate by endpoint
- Database query performance
- Authentication success/failure rate

### Health Checks

- `/health` - Basic service availability
- `/ready` - Database connectivity check

## Deployment

### Cloud Run Configuration

- **CPU**: 1 vCPU
- **Memory**: 512Mi
- **Min Instances**: 0 (scales to zero)
- **Max Instances**: 10
- **Timeout**: 60s
- **Port**: 3000

### Environment Variables

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `ALLOWED_ORIGINS`

Optional:
- `NODE_ENV` (default: development)
- `PORT` (default: 3000)
- `LOG_LEVEL` (default: info)

### CI/CD Pipeline

GitHub Actions workflow:
1. Checkout code
2. Authenticate with GCP
3. Build Docker image
4. Push to Artifact Registry
5. Deploy to Cloud Run
6. Run health check

## Future Enhancements

### Short Term

- [ ] Request validation with Zod schemas
- [ ] Rate limiting middleware
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Integration tests

### Medium Term

- [ ] Response caching with Redis
- [ ] WebSocket support for real-time features
- [ ] Metrics export to Prometheus
- [ ] Database migration system

### Long Term

- [ ] GraphQL endpoint
- [ ] Multi-region deployment
- [ ] Advanced analytics dashboard
- [ ] Machine learning integrations

## Maintenance

### Updating Dependencies

```bash
npm outdated
npm update
npm audit fix
```

### Database Migrations

Use Supabase dashboard or CLI:

```bash
supabase migration new add_new_feature
supabase migration up
```

### Monitoring Logs

```bash
# Cloud Run logs
gcloud run services logs read finishi-api --region us-central1

# Local development
npm run dev
```

## Support & Documentation

- **API Documentation**: Coming soon (Swagger UI)
- **Cloud Run Docs**: https://cloud.google.com/run/docs
- **Fastify Docs**: https://fastify.dev/docs/latest/
- **Supabase Docs**: https://supabase.com/docs
