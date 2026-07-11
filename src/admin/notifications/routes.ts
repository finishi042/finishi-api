/**
 * Admin notification routes — requires admin auth.
 * GET  /notifications       — list notifications (with filters)
 * GET  /notifications/count — unread count for badge
 * PATCH /notifications/:id/read — mark one as read
 * POST /notifications/read-all  — mark all as read
 * DELETE /notifications/:id     — dismiss (soft-delete)
 */
import type { FastifyPluginAsync } from 'fastify'
import { formatResponse } from '../../shared/supabase.js'
import { wrapHandler } from '../../shared/handler.js'
import {
  listAdminNotifications,
  markAdminNotifRead,
  markAllAdminNotifsRead,
  dismissAdminNotif,
  getAdminUnreadCount,
  type AdminNotifType,
} from './service.js'

const adminNotificationRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /notifications — list with optional filters */
  fastify.get('/notifications', wrapHandler('Failed to fetch admin notifications', async (request, reply) => {
    const query = request.query as { type?: string; unread_only?: string; page?: string; limit?: string }
    const page = parseInt(query.page ?? '1', 10)
    const limit = Math.min(parseInt(query.limit ?? '50', 10), 100)
    const offset = (page - 1) * limit

    const { notifications, total } = await listAdminNotifications({
      type: query.type as AdminNotifType | undefined,
      unreadOnly: query.unread_only === 'true',
      limit,
      offset,
    })

    return reply.send({
      ...formatResponse(notifications),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  }))

  /** GET /notifications/count — unread count for badge */
  fastify.get('/notifications/count', wrapHandler('Failed to fetch unread count', async (_request, reply) => {
    const count = await getAdminUnreadCount()
    return reply.send(formatResponse({ unread: count }))
  }))

  /** PATCH /notifications/:id/read — mark one as read */
  fastify.patch<{ Params: { id: string } }>('/notifications/:id/read', wrapHandler('Failed to mark notification as read', async (request, reply) => {
    const { id } = request.params as { id: string }
    await markAdminNotifRead(id)
    return reply.send(formatResponse({ marked: true }))
  }))

  /** POST /notifications/read-all — mark all as read */
  fastify.post('/notifications/read-all', wrapHandler('Failed to mark all as read', async (_request, reply) => {
    await markAllAdminNotifsRead()
    return reply.send(formatResponse({ marked_all: true }))
  }))

  /** DELETE /notifications/:id — dismiss */
  fastify.delete<{ Params: { id: string } }>('/notifications/:id', wrapHandler('Failed to dismiss notification', async (request, reply) => {
    const { id } = request.params as { id: string }
    await dismissAdminNotif(id)
    return reply.send(formatResponse({ dismissed: true }))
  }))
}

export default adminNotificationRoutes
