-- Migration: Add missing columns to waitlist table
-- The finishi-waitlist app created a minimal table (id, email, created_at).
-- The admin dashboard needs additional columns for management.
-- Using IF NOT EXISTS pattern via DO blocks for safety.
-- ═══════════════════════════════════════════════════════════════════════════

-- Add full_name column
DO $$ BEGIN
  ALTER TABLE waitlist ADD COLUMN full_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add learning_goal column (called "interest" in the admin UI)
DO $$ BEGIN
  ALTER TABLE waitlist ADD COLUMN learning_goal TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add status column with default 'pending'
DO $$ BEGIN
  ALTER TABLE waitlist ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add invite_sent_at column
DO $$ BEGIN
  ALTER TABLE waitlist ADD COLUMN invite_sent_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add updated_at column
DO $$ BEGIN
  ALTER TABLE waitlist ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Grant service role full access (replace restrictive RLS policy from finishi-waitlist)
-- Drop the old "block everything" policy if it exists
DO $$ BEGIN
  DROP POLICY IF EXISTS "No public access" ON waitlist;
END $$;

-- Create a policy that allows service role full access
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages waitlist" ON waitlist;
  CREATE POLICY "Service role manages waitlist" ON waitlist
    FOR ALL USING (true) WITH CHECK (true);
END $$;
