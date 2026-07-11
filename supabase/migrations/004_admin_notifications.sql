-- Migration: Admin notifications table
-- Separate from user notifications — admin alerts for platform events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'system'
    CHECK (type IN ('user', 'lesson', 'event', 'plan', 'warning', 'system', 'waitlist')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  -- Optional reference to the entity that triggered the notification
  ref_type TEXT,  -- 'user', 'lesson', 'event', 'subscription', 'waitlist'
  ref_id TEXT,    -- UUID or identifier of the referenced entity
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_admin_notifs_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifs_unread ON admin_notifications(created_at DESC) WHERE read = false AND dismissed = false;
CREATE INDEX IF NOT EXISTS idx_admin_notifs_type ON admin_notifications(type, created_at DESC);

-- RLS: Only service role (API) can access — no direct client access
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on admin_notifications" ON admin_notifications
  FOR ALL USING (true) WITH CHECK (true);
