-- Migration: Create user_onboarding table for multi-step onboarding flow
-- Stores all preferences collected during the onboarding wizard
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Step 3: Skills the user wants to learn (multi-select)
  selected_skills TEXT[] DEFAULT '{}',

  -- Step 4: Primary learning goal (single select)
  learning_goal TEXT,

  -- Step 5: Current skill level
  skill_level TEXT,

  -- Step 6: Preferred learning styles (multi-select)
  learning_styles TEXT[] DEFAULT '{}',

  -- Step 7: Challenges/obstacles (multi-select)
  challenges TEXT[] DEFAULT '{}',

  -- Step 8: Daily commitment (minutes)
  daily_commitment_mins INTEGER DEFAULT 10,

  -- Step 9: Preferred reminder time
  reminder_time TEXT,

  -- Step 10: AI voice preferences
  ai_voice TEXT DEFAULT 'calm_female',
  voice_read_responses BOOLEAN DEFAULT true,
  voice_read_summaries BOOLEAN DEFAULT true,
  voice_conversations BOOLEAN DEFAULT true,
  voice_speed TEXT DEFAULT 'normal',

  -- Step 11: Notification preferences
  notif_daily_reminder BOOLEAN DEFAULT true,
  notif_streak BOOLEAN DEFAULT true,
  notif_achievements BOOLEAN DEFAULT false,
  notif_suggestions BOOLEAN DEFAULT false,
  notif_weekly_report BOOLEAN DEFAULT false,
  notifications_allowed BOOLEAN DEFAULT false,

  -- Computed plan summary
  weekly_goal_mins INTEGER DEFAULT 70,
  estimated_completion_weeks INTEGER DEFAULT 12,

  -- Status tracking
  current_step INTEGER DEFAULT 1,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own onboarding" ON user_onboarding
  FOR ALL USING (auth.uid() = user_id);

-- Index for quick lookup of completion status
CREATE INDEX IF NOT EXISTS idx_user_onboarding_completed ON user_onboarding(user_id) WHERE completed = true;
