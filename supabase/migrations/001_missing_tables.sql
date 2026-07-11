-- Migration: Create all tables for Finishi user dashboard
-- Run this in your Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Users (application profile, not auth.users)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'active',
  skills TEXT[],
  lessons_completed INTEGER DEFAULT 0,
  suspended BOOLEAN DEFAULT false,
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- User Settings
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_goal_mins INTEGER NOT NULL DEFAULT 30,
  reminder_time TEXT NOT NULL DEFAULT '09:00',
  notif_daily BOOLEAN NOT NULL DEFAULT true,
  notif_streak BOOLEAN NOT NULL DEFAULT true,
  notif_weekly BOOLEAN NOT NULL DEFAULT true,
  notif_tips BOOLEAN NOT NULL DEFAULT true,
  privacy_analytics BOOLEAN NOT NULL DEFAULT true,
  privacy_improve BOOLEAN NOT NULL DEFAULT true,
  theme TEXT NOT NULL DEFAULT 'light',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- User Streaks
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ═══════════════════════════════════════════════════════════════
-- Skills
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#7B2CBF',
  learner_count INTEGER DEFAULT 0,
  lesson_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- Lessons
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  description TEXT,
  duration_mins INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'draft',
  view_count INTEGER DEFAULT 0,
  content TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_skill ON lessons(skill_name);
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);

-- ═══════════════════════════════════════════════════════════════
-- Learning Paths
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS learning_paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  skill_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  enrolled_count INTEGER DEFAULT 0,
  completion_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_path_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS learning_path_phase_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES learning_path_phases(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ═══════════════════════════════════════════════════════════════
-- Courses
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  duration_minutes INTEGER,
  level TEXT DEFAULT 'beginner',
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- Enrollments
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  learning_path_id UUID REFERENCES learning_paths(id) ON DELETE SET NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);

-- ═══════════════════════════════════════════════════════════════
-- Progress
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  completed_lessons TEXT[] DEFAULT '{}',
  progress_percentage NUMERIC DEFAULT 0,
  total_mins INTEGER DEFAULT 0,
  last_accessed TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);

-- ═══════════════════════════════════════════════════════════════
-- Events
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'webinar',
  skill_name TEXT,
  event_date DATE NOT NULL,
  event_time TEXT,
  duration_mins INTEGER DEFAULT 60,
  host_name TEXT,
  host_title TEXT,
  host_avatar TEXT,
  capacity INTEGER DEFAULT 0,
  registered_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming',
  description TEXT,
  platform TEXT DEFAULT 'virtual',
  location TEXT,
  cover_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

-- ═══════════════════════════════════════════════════════════════
-- Event Registrations
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_user ON event_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);

-- RPC functions for atomic counter updates
CREATE OR REPLACE FUNCTION increment_event_registered_count(eid UUID)
RETURNS void AS $$
BEGIN
  UPDATE events SET registered_count = registered_count + 1 WHERE id = eid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_event_registered_count(eid UUID)
RETURNS void AS $$
BEGIN
  UPDATE events SET registered_count = GREATEST(registered_count - 1, 0) WHERE id = eid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- Notifications
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'lesson',
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = false;

-- ═══════════════════════════════════════════════════════════════
-- Focus Sessions
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  duration_mins INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'pomodoro',
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON focus_sessions(user_id, started_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- Quizzes
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]',
  passing_score INTEGER NOT NULL DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id);

-- ═══════════════════════════════════════════════════════════════
-- Quiz Attempts
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '[]',
  score INTEGER NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts(quiz_id);

-- ═══════════════════════════════════════════════════════════════
-- Waitlist (already exists from finishi-waitlist, but just in case)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  interest TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  invite_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "Users manage own profile" ON users
  FOR ALL USING (auth.uid() = id);

-- Users can manage own settings
CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

-- Users can read own streak
CREATE POLICY "Users read own streak" ON user_streaks
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage own enrollments
CREATE POLICY "Users manage own enrollments" ON enrollments
  FOR ALL USING (auth.uid() = user_id);

-- Users can manage own progress
CREATE POLICY "Users manage own progress" ON progress
  FOR ALL USING (auth.uid() = user_id);

-- Users see own event registrations
CREATE POLICY "Users manage own event registrations" ON event_registrations
  FOR ALL USING (auth.uid() = user_id);

-- Users see own notifications
CREATE POLICY "Users manage own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id);

-- Users see own focus sessions
CREATE POLICY "Users manage own focus sessions" ON focus_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Users see own quiz attempts
CREATE POLICY "Users manage own quiz attempts" ON quiz_attempts
  FOR ALL USING (auth.uid() = user_id);

-- Quizzes are readable by all authenticated users
CREATE POLICY "Authenticated users can read quizzes" ON quizzes
  FOR SELECT USING (auth.role() = 'authenticated');

-- Events are readable by all authenticated users
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read events" ON events
  FOR SELECT USING (auth.role() = 'authenticated');

-- Lessons are readable by all authenticated users
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read lessons" ON lessons
  FOR SELECT USING (auth.role() = 'authenticated');

-- Courses are readable by all authenticated users
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read courses" ON courses
  FOR SELECT USING (auth.role() = 'authenticated');

-- Learning paths are readable by all authenticated users
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read learning paths" ON learning_paths
  FOR SELECT USING (auth.role() = 'authenticated');
