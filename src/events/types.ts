export type EventType = 'webinar' | 'workshop' | 'live-session' | 'bootcamp'
export type EventStatus = 'upcoming' | 'live' | 'completed' | 'cancelled'

export interface Event {
  id: string
  title: string
  type: EventType
  skill_name: string
  event_date: string
  event_time: string
  duration_mins: number
  host_name: string
  host_title?: string
  host_avatar?: string
  capacity: number
  registered_count: number
  status: EventStatus
  description?: string
  platform: string
  location: string
  cover_image?: string
  created_at: string
  updated_at: string
}
