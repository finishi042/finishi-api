/**
 * Admin broadcast notifications — send notifications to users and/or waitlist entries.
 *
 * POST /notifications/broadcast — Send a notification to a targeted audience.
 *   Audience options:
 *   - "all_users"      → All onboarded users
 *   - "active_users"   → Users with status = 'active'
 *   - "waitlist"       → All waitlist entries (pending + approved)
 *   - "waitlist_pending" → Waitlist entries with status = 'pending'
 *   - "everyone"       → Both all_users + waitlist
 */
import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'
import { createAdminNotification } from '../notifications/service.js'

const BroadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  type: z.enum(['system', 'event', 'lesson', 'plan', 'warning']).default('system'),
  audience: z.enum(['all_users', 'active_users', 'waitlist', 'waitlist_pending', 'everyone']),
})

const adminBroadcastRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /notifications/broadcast
   * Send a notification to a targeted audience.
   */
  fastify.post('/notifications/broadcast', async (request, reply) => {
    const parsed = BroadcastSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to broadcast notification', async (req, rep) => {
      const { title, body, type, audience } = parsed.data
      const now = new Date().toISOString()
      let userCount = 0
      let waitlistCount = 0

      // Send to onboarded users
      if (['all_users', 'active_users', 'everyone'].includes(audience)) {
        let userQuery = req.supabase.from('users').select('id')

        if (audience === 'active_users') {
          userQuery = userQuery.eq('status', 'active')
        }

        const { data: users, error: usersErr } = await userQuery
        if (usersErr) throw usersErr

        if (users && users.length > 0) {
          // Batch insert notifications for all users
          const notifications = users.map((u: any) => ({
            user_id: u.id,
            type,
            title,
            body,
            read: false,
            created_at: now,
          }))

          // Insert in batches of 500 to avoid payload limits
          const batchSize = 500
          for (let i = 0; i < notifications.length; i += batchSize) {
            const batch = notifications.slice(i, i + batchSize)
            const { error: insertErr } = await req.supabase
              .from('notifications')
              .insert(batch)
            if (insertErr) {
              req.log.error({ error: insertErr, batch: i }, 'Failed to insert notification batch')
            }
          }

          userCount = users.length
        }
      }

      // Send to waitlist entries
      if (['waitlist', 'waitlist_pending', 'everyone'].includes(audience)) {
        let waitlistQuery = req.supabase.from('waitlist').select('id, email')

        if (audience === 'waitlist_pending') {
          waitlistQuery = waitlistQuery.eq('status', 'pending')
        }

        const { data: entries, error: wlErr } = await waitlistQuery
        if (wlErr) throw wlErr

        if (entries && entries.length > 0) {
          // Store notifications for waitlist users in a separate table
          const waitlistNotifs = entries.map((e: any) => ({
            waitlist_id: e.id,
            email: e.email,
            type,
            title,
            body,
            read: false,
            created_at: now,
          }))

          const batchSize = 500
          for (let i = 0; i < waitlistNotifs.length; i += batchSize) {
            const batch = waitlistNotifs.slice(i, i + batchSize)
            const { error: insertErr } = await req.supabase
              .from('waitlist_notifications')
              .insert(batch)
            if (insertErr) {
              req.log.error({ error: insertErr, batch: i }, 'Failed to insert waitlist notification batch')
            }
          }

          waitlistCount = entries.length
        }
      }

      // Log admin action as admin notification
      createAdminNotification({
        type: 'system',
        title: 'Broadcast sent',
        body: `"${title}" sent to ${userCount} user${userCount !== 1 ? 's' : ''}${waitlistCount > 0 ? ` and ${waitlistCount} waitlist entr${waitlistCount !== 1 ? 'ies' : 'y'}` : ''}.`,
        metadata: { audience, user_count: userCount, waitlist_count: waitlistCount },
      }).catch(() => {})

      req.log.info({ audience, userCount, waitlistCount, title }, 'Broadcast notification sent')

      return rep.send(formatResponse({
        sent: true,
        audience,
        user_count: userCount,
        waitlist_count: waitlistCount,
        total: userCount + waitlistCount,
      }))
    })(request, reply)
  })

  /**
   * GET /notifications/broadcasts
   * List past broadcast notifications (from admin_notifications with type='system' and metadata.audience).
   */
  fastify.get('/notifications/broadcasts', wrapHandler('Failed to fetch broadcasts', async (request, reply) => {
    const { data, error } = await request.supabase
      .from('admin_notifications')
      .select('*')
      .eq('type', 'system')
      .ilike('title', '%Broadcast sent%')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return reply.send(formatResponse(data ?? []))
  }))
}

export default adminBroadcastRoutes
