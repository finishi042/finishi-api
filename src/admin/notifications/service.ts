/**
 * AdminNotificationService — creates and queries admin notifications.
 * Single responsibility: CRUD operations on the admin_notifications table.
 */
import { getSupabase } from '../../shared/supabase.js'

export type AdminNotifType = 'user' | 'lesson' | 'event' | 'plan' | 'warning' | 'system' | 'waitlist'

export interface AdminNotification {
  id: string
  type: AdminNotifType
  title: string
  body: string
  read: boolean
  read_at: string | null
  dismissed: boolean
  ref_type: string | null
  ref_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface CreateAdminNotifParams {
  type: AdminNotifType
  title: string
  body: string
  ref_type?: string
  ref_id?: string
  metadata?: Record<string, unknown>
}

/**
 * Create a new admin notification (fire-and-forget safe).
 */
export async function createAdminNotification(params: CreateAdminNotifParams): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('admin_notifications').insert({
    type: params.type,
    title: params.title,
    body: params.body,
    ref_type: params.ref_type ?? null,
    ref_id: params.ref_id ?? null,
    metadata: params.metadata ?? {},
  })
}

/**
 * List admin notifications with optional filters.
 */
export async function listAdminNotifications(opts?: {
  type?: AdminNotifType
  unreadOnly?: boolean
  limit?: number
  offset?: number
}) {
  const supabase = getSupabase()
  const limit = opts?.limit ?? 50
  const offset = opts?.offset ?? 0

  let query = supabase
    .from('admin_notifications')
    .select('*', { count: 'exact' })
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (opts?.type) query = query.eq('type', opts.type)
  if (opts?.unreadOnly) query = query.eq('read', false)

  const { data, error, count } = await query
  if (error) throw error
  return { notifications: (data ?? []) as AdminNotification[], total: count ?? 0 }
}

/**
 * Mark a single notification as read.
 */
export async function markAdminNotifRead(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('admin_notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Mark all unread notifications as read.
 */
export async function markAllAdminNotifsRead(): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('admin_notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('read', false)
  if (error) throw error
}

/**
 * Dismiss (soft-delete) a notification.
 */
export async function dismissAdminNotif(id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('admin_notifications')
    .update({ dismissed: true })
    .eq('id', id)
  if (error) throw error
}

/**
 * Get unread count for badge display.
 */
export async function getAdminUnreadCount(): Promise<number> {
  const supabase = getSupabase()
  const { count, error } = await supabase
    .from('admin_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false)
    .eq('dismissed', false)
  if (error) throw error
  return count ?? 0
}
