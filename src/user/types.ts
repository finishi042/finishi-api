export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  role: string
  plan?: 'free' | 'pro' | 'enterprise'
  status?: 'active' | 'inactive' | 'suspended'
  skills?: string[]
  lessons_completed?: number
  suspended?: boolean
  suspended_at?: string
  suspended_reason?: string
  last_login?: string
  created_at: string
  updated_at: string
}

export interface UserSettings {
  user_id: string
  daily_goal_mins: number
  reminder_time: string
  notif_daily: boolean
  notif_streak: boolean
  notif_weekly: boolean
  notif_tips: boolean
  privacy_analytics: boolean
  privacy_improve: boolean
  theme: 'light' | 'dark'
  updated_at: string
}

export interface UserStreak {
  user_id: string
  current_streak: number
  longest_streak: number
  last_active_date: string
}

export type AdminPermission =
  | 'users:read'
  | 'users:write'
  | 'content:read'
  | 'content:write'
  | 'analytics:read'
  | 'waitlist:read'
  | 'waitlist:write'
  | 'events:read'
  | 'events:write'

export interface AdminProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  role: 'admin'
  permissions: AdminPermission[]
  last_login?: string
  created_at: string
  updated_at: string
}
