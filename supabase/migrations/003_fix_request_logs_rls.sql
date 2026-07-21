-- Fix: request_logs RLS policy blocks inserts from the service role client.
--
-- The original policy used FOR ALL USING(...) without WITH CHECK(...),
-- which silently blocks INSERT operations. Additionally, auth.role()
-- may not resolve to 'service_role' for the service-role key in all
-- Supabase client configurations.
--
-- Since request_logs is a server-internal table (never accessed by end-user
-- clients directly), we disable RLS entirely. Access control is handled at
-- the application layer (admin routes require authentication + admin role).

-- Drop the broken policy
DROP POLICY IF EXISTS "Service role full access on request_logs" ON request_logs;

-- Disable RLS — this table is only accessed via the service role key
ALTER TABLE request_logs DISABLE ROW LEVEL SECURITY;
