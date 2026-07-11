-- ═══════════════════════════════════════════════════════════════════════════
-- Cleanup Script: Truncate all application data
-- Preserves: waitlist, impressions, admins (and auth.users)
-- 
-- Run in Supabase SQL Editor or via: psql -f scripts/cleanup.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Disable triggers temporarily for clean truncation
SET session_replication_role = 'replica';

-- Truncate in dependency order (children first)
-- Using DO block with existence checks so the script doesn't fail if a migration hasn't been run yet
DO $$
DECLARE
  tables_to_truncate TEXT[] := ARRAY[
    'quiz_attempts',
    'quizzes',
    'focus_sessions',
    'notifications',
    'event_registrations',
    'events',
    'progress',
    'enrollments',
    'learning_path_phase_lessons',
    'learning_path_phases',
    'learning_paths',
    'lessons',
    'skills',
    'courses',
    'user_streaks',
    'user_settings',
    'subscriptions',
    'users'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_truncate
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('TRUNCATE TABLE %I CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Summary
DO $$
BEGIN
  RAISE NOTICE 'Cleanup complete. Preserved tables: waitlist, impressions, admins.';
  RAISE NOTICE 'To remove auth users, use the Supabase Auth dashboard.';
END $$;
