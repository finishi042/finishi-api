export type LessonStatus = 'published' | 'draft'

export interface Lesson {
  id: string
  title: string
  skill_name: string
  description: string
  duration_mins: number
  status: LessonStatus
  view_count: number
  content?: string
  video_url?: string
  created_at: string
  updated_at: string
}

export type PathStatus = 'active' | 'draft' | 'archived'

export interface LearningPath {
  id: string
  name: string
  description: string
  skill_name: string
  status: PathStatus
  enrolled_count: number
  completion_rate: number
  created_at: string
  updated_at: string
}

export interface LearningPathPhase {
  id: string
  learning_path_id: string
  title: string
  description: string
  order_index: number
  lessons?: LearningPathPhaseLesson[]
}

export interface LearningPathPhaseLesson {
  id: string
  phase_id: string
  lesson_id: string
  order_index: number
  lesson?: Lesson
}

export interface Skill {
  id: string
  name: string
  description: string
  color: string
  learner_count: number
  lesson_count: number
  created_at: string
  updated_at: string
}

export interface Course {
  id: string
  title: string
  description: string
  thumbnail_url?: string
  duration_minutes?: number
  level?: 'beginner' | 'intermediate' | 'advanced'
  published: boolean
  created_at: string
  updated_at: string
}

export interface Progress {
  id: string
  user_id: string
  course_id: string
  lesson_id?: string
  completed_lessons: string[]
  progress_percentage: number
  total_mins?: number
  last_accessed: string
  completed_at?: string
}

export interface Enrollment {
  id: string
  user_id: string
  course_id?: string
  learning_path_id?: string
  enrolled_at: string
  completed_at?: string
}
