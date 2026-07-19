-- Migration 009: Waitlist Notifications
-- Stores notifications sent to waitlist users (who don't have accounts yet).
-- When they eventually sign up, pending notifications can be migrated to the users notifications table.

CREATE TABLE IF NOT EXISTS waitlist_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_id UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_notifs_waitlist ON waitlist_notifications(waitlist_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_notifs_email ON waitlist_notifications(email);

-- Disable RLS (admin service role handles all access)
ALTER TABLE waitlist_notifications DISABLE ROW LEVEL SECURITY;
