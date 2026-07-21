/**
 * Monitoring domain — type definitions.
 */

export interface RequestLogEntry {
  direction: 'inbound' | 'outbound'
  provider?: string
  method: string
  path: string
  status_code?: number
  request_headers?: Record<string, unknown>
  request_body_size?: number
  response_body_size?: number
  duration_ms: number
  started_at: string
  completed_at?: string
  user_id?: string
  request_id?: string
  ip_address?: string
  user_agent?: string
  is_error: boolean
  error_message?: string
  error_code?: string
  metadata?: Record<string, unknown>
}
