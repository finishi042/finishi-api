-- Migration: Fix RLS policies for tables that are being blocked
-- The service role key SHOULD bypass RLS, but some configurations require explicit policies.
-- This ensures all content tables are accessible by the API.
-- ═══════════════════════════════════════════════════════════════════════════

-- Disable RLS entirely on content tables managed exclusively by the API
-- (These are admin-managed tables — no direct client access needed)
ALTER TABLE IF EXISTS skills DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS learning_paths DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS learning_path_phases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS learning_path_phase_lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS impressions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admin_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS waitlist DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions DISABLE ROW LEVEL SECURITY;
