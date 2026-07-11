export interface FocusSession {
  id: string
  user_id: string
  duration_mins: number
  type: string
  lesson_id?: string
  completed: boolean
  started_at: string
  ended_at?: string
}

export interface FocusStats {
  total_sessions: number
  total_minutes: number
  this_week_sessions: number
  this_week_minutes: number
  today_sessions: number
  today_minutes: number
  average_session_mins: number
}
