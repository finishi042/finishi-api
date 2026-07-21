-- Migration: Request/Response monitoring table
-- Tracks all incoming API requests and outgoing calls to external providers
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Request Logs — stores every HTTP request (incoming + outgoing)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request classification
  direction TEXT NOT NULL DEFAULT 'inbound',  -- 'inbound' (API request) or 'outbound' (external provider call)
  provider TEXT,                               -- null for inbound; 'paystack', 'gemini', 'groq', 'openrouter', etc.

  -- HTTP details
  method TEXT NOT NULL,                        -- GET, POST, PUT, DELETE, PATCH
  path TEXT NOT NULL,                          -- /api/v1/user/profile or https://api.paystack.co/transaction/verify/...
  status_code INTEGER,                         -- HTTP status code of the response
  request_headers JSONB,                       -- Sanitized headers (auth tokens redacted)
  request_body_size INTEGER DEFAULT 0,         -- Size in bytes (we don't store the body itself)
  response_body_size INTEGER DEFAULT 0,        -- Size in bytes

  -- Timing
  duration_ms NUMERIC NOT NULL DEFAULT 0,      -- Total round-trip time in milliseconds
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Context
  user_id UUID,                                -- Authenticated user (null for public/webhook routes)
  request_id TEXT,                             -- Fastify request ID (x-request-id)
  ip_address TEXT,                             -- Client IP (for inbound)
  user_agent TEXT,                             -- Client user-agent (for inbound)

  -- Error tracking
  is_error BOOLEAN NOT NULL DEFAULT false,     -- true if status >= 400
  error_message TEXT,                          -- Short error description if failed
  error_code TEXT,                             -- Application error code (RATE_LIMIT_EXCEEDED, etc.)

  -- Metadata
  metadata JSONB DEFAULT '{}',                 -- Flexible extra data (route params, provider response codes, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- Indexes for analytics queries
-- ═══════════════════════════════════════════════════════════════

-- Time-series queries (dashboard charts)
CREATE INDEX IF NOT EXISTS idx_request_logs_started_at ON request_logs(started_at DESC);

-- Filter by direction (inbound vs outbound analytics)
CREATE INDEX IF NOT EXISTS idx_request_logs_direction ON request_logs(direction, started_at DESC);

-- Provider health monitoring
CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider, started_at DESC) WHERE provider IS NOT NULL;

-- Error tracking
CREATE INDEX IF NOT EXISTS idx_request_logs_errors ON request_logs(is_error, started_at DESC) WHERE is_error = true;

-- Per-user request history
CREATE INDEX IF NOT EXISTS idx_request_logs_user ON request_logs(user_id, started_at DESC) WHERE user_id IS NOT NULL;

-- Top endpoints analysis
CREATE INDEX IF NOT EXISTS idx_request_logs_path ON request_logs(method, path, started_at DESC);

-- Status code distribution
CREATE INDEX IF NOT EXISTS idx_request_logs_status ON request_logs(status_code, started_at DESC);

-- Composite index for common admin dashboard query (direction + time range + error)
CREATE INDEX IF NOT EXISTS idx_request_logs_dashboard ON request_logs(direction, is_error, started_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Auto-cleanup: partition-like approach with a retention policy
-- Keeps logs for 30 days by default
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cleanup_old_request_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM request_logs WHERE created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- RLS — Disabled for request_logs (server-internal table).
-- Access control is enforced at the application layer:
-- only admin routes (authenticated + requireAdmin) query this table.
-- ═══════════════════════════════════════════════════════════════
-- RLS intentionally NOT enabled — this table is only accessed via the
-- service role key from the API server. No end-user client touches it.
