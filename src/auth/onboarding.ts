/**
 * User provisioning (onboarding) service.
 * Creates the application-level rows (users, user_settings, user_streaks)
 * the first time a Supabase Auth user interacts with the platform.
 *
 * Single Responsibility: only handles user row creation/existence checks.
 */
import { getSupabase } from '../shared/supabase.js'

export interface ProvisionUserParams {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
}

/**
 * Ensure the application-level user profile exists.
 * If the row already exists this is a no-op.
 * Returns the user profile row.
 */
export async function provisionUser(params: ProvisionUserParams) {
  const supabase = getSupabase()

  // Check if user profile already exists
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('id', params.id)
    .single()

  if (existing) return existing

  // Create user profile, settings, and streak in parallel
  const now = new Date().toISOString()

  const [profileResult] = await Promise.all([
    supabase
      .from('users')
      .insert({
        id: params.id,
        email: params.email,
        full_name: params.full_name ?? null,
        avatar_url: params.avatar_url ?? null,
        role: 'user',
        plan: 'free',
        status: 'active',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single(),
    supabase
      .from('user_settings')
      .insert({
        user_id: params.id,
        daily_goal_mins: 30,
        reminder_time: '09:00',
        notif_daily: true,
        notif_streak: true,
        notif_weekly: true,
        notif_tips: true,
        privacy_analytics: true,
        privacy_improve: true,
        theme: 'light',
        updated_at: now,
      }),
    supabase
      .from('user_streaks')
      .insert({
        user_id: params.id,
        current_streak: 0,
        longest_streak: 0,
        last_active_date: new Date().toISOString().slice(0, 10),
      }),
  ])

  if (profileResult.error) {
    // If it's a duplicate key error, another request won the race — that's fine
    if (profileResult.error.code === '23505') {
      const { data } = await supabase.from('users').select('id').eq('id', params.id).single()
      return data
    }
    throw new Error(`Failed to provision user: ${profileResult.error.message}`)
  }

  return profileResult.data
}
