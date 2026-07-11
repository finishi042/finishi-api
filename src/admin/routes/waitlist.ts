import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { WaitlistEntry } from '../types.js'
import { WaitlistStatusSchema, WaitlistInviteSchema, WaitlistQuerySchema } from '../schemas.js'

const adminWaitlistRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /waitlist */
  fastify.get('/waitlist', wrapHandler('Failed to fetch waitlist', async (request, reply) => {
    const q = WaitlistQuerySchema.safeParse(request.query)

    let query = request.supabase
      .from('waitlist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (q.success) {
      if (q.data.status && q.data.status !== 'all') query = query.eq('status', q.data.status)
      if (q.data.search)
        query = query.or(`email.ilike.%${q.data.search}%,full_name.ilike.%${q.data.search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error
    return reply.send({ ...formatResponse(data as WaitlistEntry[]), meta: { total: count ?? 0 } })
  }))

  /** PATCH /waitlist/:id/status */
  fastify.patch<{ Params: { id: string } }>('/waitlist/:id/status', async (request, reply) => {
    const parsed = WaitlistStatusSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to update waitlist status', async (req, rep) => {
      const { id } = req.params as { id: string }
      const { data, error } = await req.supabase
        .from('waitlist')
        .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Entry not found'))
        throw error
      }
      return rep.send(formatResponse(data as WaitlistEntry))
    })(request, reply)
  })

  /** POST /waitlist/invite */
  fastify.post('/waitlist/invite', async (request, reply) => {
    const parsed = WaitlistInviteSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to send invites', async (req, rep) => {
      const { data, error } = await req.supabase
        .from('waitlist')
        .update({ status: 'approved', invite_sent_at: new Date().toISOString() })
        .in('email', parsed.data.emails)
        .select()
      if (error) throw error
      return rep.send(formatResponse({ invited: data?.length ?? 0, emails: parsed.data.emails }))
    })(request, reply)
  })
}

export default adminWaitlistRoutes
