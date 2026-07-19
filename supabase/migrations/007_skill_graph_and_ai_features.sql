-- Migration 007: Skill Graph, Mastery, Lesson Attempts, Capstone, Completion Summary
-- Adds tables required for F3 (Skill Graph), F5 (Mastery), F9 (Capstone), F10 (Completion Summary)
-- Also adds behavioral instrumentation (lesson_attempts) per PRD §09
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Alter skills: add is_flagship flag
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_flagship BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE skills ADD COLUMN IF NOT EXISTS estimated_days INTEGER DEFAULT 28;

-- ═══════════════════════════════════════════════════════════════
-- Skill Graph Nodes — Expert-authored concept map per skill
-- Each node is a concept with prerequisites, misconceptions, etc.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS skill_graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  description TEXT,
  prerequisites UUID[] DEFAULT '{}',         -- references other node IDs
  misconceptions TEXT[] DEFAULT '{}',        -- common misunderstandings
  examples TEXT[] DEFAULT '{}',              -- worked examples
  difficulty INTEGER NOT NULL DEFAULT 1,     -- 1=beginner, 2=intermediate, 3=advanced
  priority INTEGER NOT NULL DEFAULT 1,       -- ordering weight for sequencing
  order_index INTEGER NOT NULL DEFAULT 0,    -- default linear order within skill
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_graph_nodes_skill ON skill_graph_nodes(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_graph_nodes_difficulty ON skill_graph_nodes(difficulty);

-- Unique constraint for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_graph_nodes_unique ON skill_graph_nodes(skill_id, concept);

-- ═══════════════════════════════════════════════════════════════
-- Alter lessons: link to skill graph node
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS node_id UUID REFERENCES skill_graph_nodes(id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS skill_id UUID REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS day_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_lessons_node ON lessons(node_id);
CREATE INDEX IF NOT EXISTS idx_lessons_skill_id ON lessons(skill_id);

-- ═══════════════════════════════════════════════════════════════
-- Mastery — Qualitative mastery per concept per user
-- Status: 'not_started' | 'in_progress' | 'needs_practice' | 'improving' | 'strong'
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES skill_graph_nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started',
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_mastery_user ON mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_mastery_node ON mastery(node_id);

-- ═══════════════════════════════════════════════════════════════
-- Lesson Attempts — Behavioral instrumentation (collected from day one)
-- Tracks time_spent, hints_used, reflection, quiz performance per attempt
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lesson_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  node_id UUID REFERENCES skill_graph_nodes(id) ON DELETE SET NULL,
  quiz_score INTEGER,
  time_spent_secs INTEGER NOT NULL DEFAULT 0,
  hints_used INTEGER NOT NULL DEFAULT 0,
  reflection TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_attempts_user ON lesson_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_attempts_lesson ON lesson_attempts(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_attempts_node ON lesson_attempts(node_id);

-- ═══════════════════════════════════════════════════════════════
-- Capstone Submissions — F9: Applied project + rubric grading
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS capstone_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  submission TEXT NOT NULL,                   -- the user's artifact (text/markdown)
  rubric_scores JSONB DEFAULT '{}',          -- { criterion: { score, feedback } }
  ai_feedback TEXT,                          -- overall qualitative feedback
  ai_provider TEXT,                          -- which AI provider graded this
  overall_status TEXT DEFAULT 'submitted',   -- submitted | graded | needs_revision
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_capstone_user ON capstone_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_capstone_skill ON capstone_submissions(skill_id);

-- ═══════════════════════════════════════════════════════════════
-- Completion Summaries — F10: Shareable proof-of-finish
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS completion_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  capstone_id UUID REFERENCES capstone_submissions(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_invested_mins INTEGER DEFAULT 0,
  total_lessons INTEGER DEFAULT 0,
  total_days INTEGER DEFAULT 0,
  concept_mastery JSONB DEFAULT '{}',        -- { concept: status } snapshot at completion
  share_url TEXT UNIQUE,                     -- public shareable link slug
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_completion_user ON completion_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_completion_share ON completion_summaries(share_url);

-- ═══════════════════════════════════════════════════════════════
-- Alter learning_paths: add experience_level for personalization
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS experience_level TEXT DEFAULT 'beginner';
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS personalized BOOLEAN DEFAULT false;
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS estimated_finish_date DATE;
ALTER TABLE learning_paths ADD COLUMN IF NOT EXISTS skill_id UUID REFERENCES skills(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- Capstone Rubrics — Expert-authored grading criteria per skill
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS capstone_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  criteria JSONB NOT NULL DEFAULT '[]',      -- [{ name, description, weight, levels: [...] }]
  project_prompt TEXT NOT NULL,              -- what the learner is asked to produce
  project_description TEXT,                  -- more context for the learner
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(skill_id)
);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies for new tables
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE skill_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE capstone_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE completion_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE capstone_rubrics ENABLE ROW LEVEL SECURITY;

-- Skill graph nodes are readable by all authenticated users
DO $$ BEGIN
  CREATE POLICY "skill_graph_nodes_read" ON skill_graph_nodes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mastery: users can read/write their own
DO $$ BEGIN
  CREATE POLICY "mastery_user_select" ON mastery FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mastery_user_insert" ON mastery FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "mastery_user_update" ON mastery FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lesson attempts: users can read/write their own
DO $$ BEGIN
  CREATE POLICY "lesson_attempts_user_select" ON lesson_attempts FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "lesson_attempts_user_insert" ON lesson_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Capstone submissions: users can read/write their own
DO $$ BEGIN
  CREATE POLICY "capstone_user_select" ON capstone_submissions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "capstone_user_insert" ON capstone_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Completion summaries: users can read their own; public can read via share_url (handled in API)
DO $$ BEGIN
  CREATE POLICY "completion_user_select" ON completion_summaries FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rubrics are readable by all authenticated users
DO $$ BEGIN
  CREATE POLICY "capstone_rubrics_read" ON capstone_rubrics FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
