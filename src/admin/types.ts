export interface Analytics {
  total_users: number
  active_users: number
  total_courses: number
  enrollments: number
  completion_rate: number
}

export interface DashboardKPIs {
  total_users: number
  active_learners: number
  lessons_completed: number
  learning_paths: number
}

export interface DailyActivity {
  date: string
  active_users: number
  lessons_completed: number
}

export type WaitlistStatus = 'pending' | 'approved' | 'rejected'

export interface WaitlistEntry {
  id: string
  full_name: string
  email: string
  learning_goal?: string
  status: WaitlistStatus
  invite_sent_at?: string
  created_at: string
  updated_at: string
}

// ── Admin account types ───────────────────────────────────────────────────

export type AdminRole = 'admin' | 'super_admin'

export interface Admin {
  id: string
  auth_user_id: string | null
  email: string
  full_name: string
  role: AdminRole
  avatar_url: string | null
  is_active: boolean
  last_login: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
