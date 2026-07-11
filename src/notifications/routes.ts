import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'
import { parsePagination } from '../shared/schemas.js'

const userNotificationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  /** GET /notifications — Get user's notifications (newest first) */
  fastify.get<{
    Querystring: { unread_only?: string; page?: string; limit?: string }
  }>('/notifications', wrapHandler('Failed to fetch notifications', async (request, reply) => {
    const userId = request.user!.id
    const query = request.query as { unread_only?: string; page?: string; limit?: string }
    const { page, limit, offset } = parsePagination(query)
    const unreadOnly = query.unread_only === 'true'

    let dbQuery = request.supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (unreadOnly) {
      dbQuery = dbQuery.eq('read', false)
    }

    const { data, error, count } = await dbQuery
    if (error) throw error

    // Get unread count
    const { count: unreadCount } = await request.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)

    return reply.send({
      ...formatResponse(data),
      meta: { page, limit, total: count ?? 0, unread_count: unreadCount ?? 0 },
    })
  }))

  /** PUT /notifications/:id/read — Mark a single notification as read */
  fastify.put<{ Params: { id: string } }>('/notifications/:id/read', wrapHandler('Failed to mark notification as read', async (request, reply) => {
    const userId = request.user!.id
    const { id } = request.params as { id: string }

    const { data, error } = await request.supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Notification not found'))
      throw error
    }

    return reply.send(formatResponse(data))
  }))

  /** PUT /notifications/read-all — Mark all notifications as read */
  fastify.put('/notifications/read-all', wrapHandler('Failed to mark all notifications as read', async (request, reply) => {
    const userId = request.user!.id

    const { error } = await request.supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false)

    if (error) throw error

    return reply.send(formatResponse({ success: true }))
  }))
}

export default userNotificationsRoutes
