import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { UserProfile } from '../../user/types.js'

const adminUsersRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /users — List all users with pagination */
  fastify.get<{
    Querystring: { page?: string; limit?: string; search?: string }
  }>('/users', wrapHandler('Failed to fetch users', async (request, reply) => {
    const { page: rawPage, limit: rawLimit, search } = request.query as { page?: string; limit?: string; search?: string }
    const page = parseInt(rawPage || '1', 10)
    const limit = parseInt(rawLimit || '20', 10)
    const offset = (page - 1) * limit

    let query = request.supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error

    return reply.send({
      ...formatResponse(data as UserProfile[]),
      meta: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    })
  }))

  /** GET /users/:id — Get user details by ID */
  fastify.get<{ Params: { id: string } }>('/users/:id', wrapHandler('Failed to fetch user', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await request.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('User not found'))
      throw error
    }
    return reply.send(formatResponse(data as UserProfile))
  }))

  /** POST /users/:id/suspend — Suspend a user account */
  fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/users/:id/suspend',
    wrapHandler('Failed to suspend user', async (request, reply) => {
      const { id } = request.params as { id: string }
      const { reason } = request.body as { reason?: string }

      const { data, error } = await request.supabase
        .from('users')
        .update({
          suspended: true,
          suspended_at: new Date().toISOString(),
          suspended_reason: reason,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        if (error.code === 'PGRST116') return reply.code(404).send(formatError('User not found'))
        throw error
      }

      request.log.info({ userId: id, adminId: request.user?.id }, 'User suspended')
      return reply.send(formatResponse(data))
    })
  )

  /** DELETE /users/:id — Delete a user account */
  fastify.delete<{ Params: { id: string } }>('/users/:id', wrapHandler('Failed to delete user', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { error } = await request.supabase.from('users').delete().eq('id', id)
    if (error) throw error

    request.log.info({ userId: id, adminId: request.user?.id }, 'User deleted')
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminUsersRoutes
