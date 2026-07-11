-- Migration: Create admins table with default super admin
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Admins table (separate from users — admins are not learners)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMPTZ,
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admins_auth_user ON admins(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

-- ═══════════════════════════════════════════════════════════════
-- Default super admin
-- This creates the application-level record. The corresponding
-- auth.users entry must be created via Supabase dashboard or
-- the POST /auth/admin/login endpoint (first login bootstraps it).
-- ═══════════════════════════════════════════════════════════════
-- NOTE: Replace 'admin@finishi.com' with your actual super admin email.
-- The auth_user_id will be linked on first login.
INSERT INTO admins (email, full_name, role)
VALUES ('admin@finishi.com', 'Finishi Super Admin', 'super_admin')
ON CONFLICT (email) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Only the service role (API) can access admins table
-- No direct client access — all admin operations go through the API
CREATE POLICY "Service role full access on admins" ON admins
  FOR ALL USING (true) WITH CHECK (true);
