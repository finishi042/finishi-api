import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { Event } from '../../events/types.js'
import { CreateEventSchema, UpdateEventSchema, EventQuerySchema } from '../../events/schemas.js'

const adminEventsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /events */
  fastify.get('/events', wrapHandler('Failed to fetch events', async (request, reply) => {
    const q = EventQuerySchema.safeParse(request.query)

    let query = request.supabase
      .from('events')
      .select('*', { count: 'exact' })
      .order('event_date', { ascending: true })

    if (q.success) {
      if (q.data.status && q.data.status !== 'all') query = query.eq('status', q.data.status)
      if (q.data.type && q.data.type !== 'all') query = query.eq('type', q.data.type)
      if (q.data.search)
        {query = query.or(`title.ilike.%${q.data.search}%,skill_name.ilike.%${q.data.search}%`)}
    }

    const { data, error, count } = await query
    if (error) throw error
    return reply.send({ ...formatResponse(data as Event[]), meta: { total: count ?? 0 } })
  }))

  /** POST /events */
  fastify.post('/events', async (request, reply) => {
    const parsed = CreateEventSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to create event', async (req, rep) => {
      const { data, error } = await req.supabase
        .from('events')
        .insert({ ...parsed.data, registered_count: 0, status: 'upcoming' })
        .select()
        .single()
      if (error) throw error
      return rep.code(201).send(formatResponse(data as Event))
    })(request, reply)
  })

  /** PUT /events/:id */
  fastify.put<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const parsed = UpdateEventSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to update event', async (req, rep) => {
      const { id } = req.params as { id: string }
      const { data, error } = await req.supabase
        .from('events')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Event not found'))
        throw error
      }
      return rep.send(formatResponse(data as Event))
    })(request, reply)
  })

  /** DELETE /events/:id */
  fastify.delete<{ Params: { id: string } }>('/events/:id', wrapHandler('Failed to delete event', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { error } = await request.supabase.from('events').delete().eq('id', id)
    if (error) throw error
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminEventsRoutes
