-- Migration 008: Restructure hierarchy to Skill → Learning Path → Courses → Lessons
-- 
-- New hierarchy:
--   Skill (top-level subject area)
--   └── Learning Path (guided roadmap to master a skill)
--       └── Course (focused topic module within a path)
--           └── Lesson (individual content unit)
--
-- Changes:
--   1. Add skill_id FK to courses (courses belong to a skill)
--   2. Add course_id FK to lessons (lessons belong to a course)
--   3. Create learning_path_courses join table (paths contain ordered courses)
--   4. Drop old learning_path_phases / learning_path_phase_lessons (replaced by courses)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. Courses now belong to a Skill
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE courses ADD COLUMN IF NOT EXISTS skill_id UUID REFERENCES skills(id) ON DELETE SET NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS skill_name TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS lesson_count INTEGER DEFAULT 0;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_courses_skill ON courses(skill_id);
CREATE INDEX IF NOT EXISTS idx_courses_skill_name ON courses(skill_name);

-- ═══════════════════════════════════════════════════════════════
-- 2. Lessons now belong to a Course
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. Learning Path Courses — ordered courses within a learning path
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS learning_path_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_path_id UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(learning_path_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_lpc_path ON learning_path_courses(learning_path_id);
CREATE INDEX IF NOT EXISTS idx_lpc_course ON learning_path_courses(course_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. Drop old phase-based structure (replaced by course-based)
-- ═══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS learning_path_phase_lessons CASCADE;
DROP TABLE IF EXISTS learning_path_phases CASCADE;
