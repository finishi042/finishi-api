import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'
import type { Event } from './types.js'
import { parsePagination } from '../shared/schemas.js'

const userEventsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  /** GET /events — List upcoming and live events visible to users */
  fastify.get<{
    Querystring: { type?: string; status?: string; page?: string; limit?: string }
  }>('/events', wrapHandler('Failed to fetch events', async (request, reply) => {
    const query = request.query as { type?: string; status?: string; page?: string; limit?: string }
    const { page, limit, offset } = parsePagination(query)
    const { type, status } = query

    let dbQuery = request.supabase
      .from('events')
      .select('*', { count: 'exact' })
      .in('status', ['upcoming', 'live', 'completed'])
      .order('event_date', { ascending: true })
      .range(offset, offset + limit - 1)

    if (type && ['webinar', 'workshop', 'live-session', 'bootcamp'].includes(type)) {
      dbQuery = dbQuery.eq('type', type)
    }
    if (status && ['upcoming', 'live', 'completed'].includes(status)) {
      dbQuery = dbQuery.eq('status', status)
    }

    const { data, error, count } = await dbQuery
    if (error) throw error

    // Get user's registrations to mark which events they've registered for
    const userId = request.user!.id
    const { data: registrations } = await request.supabase
      .from('event_registrations')
      .select('event_id')
      .eq('user_id', userId)

    const registeredIds = new Set((registrations ?? []).map((r: any) => r.event_id))
    const events = (data as Event[]).map((event) => ({
      ...event,
      is_registered: registeredIds.has(event.id),
    }))

    return reply.send({
      ...formatResponse(events),
      meta: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    })
  }))

  /** GET /events/:id — Get single event details */
  fastify.get<{ Params: { id: string } }>('/events/:id', wrapHandler('Failed to fetch event', async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user!.id

    const { data, error } = await request.supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return reply.code(404).send(formatError('Event not found'))
      throw error
    }

    // Check if user is registered
    const { data: registration } = await request.supabase
      .from('event_registrations')
      .select('id, registered_at')
      .eq('user_id', userId)
      .eq('event_id', id)
      .single()

    return reply.send(
      formatResponse({ ...data, is_registered: !!registration, registration })
    )
  }))

  /** POST /events/:id/register — Register for an event */
  fastify.post<{ Params: { id: string } }>('/events/:id/register', wrapHandler('Failed to register for event', async (request, reply) => {
    const userId = request.user!.id
    const { id: eventId } = request.params as { id: string }

    // Check event exists and has capacity
    const { data: event, error: eventErr } = await request.supabase
      .from('events')
      .select('id, capacity, registered_count, status')
      .eq('id', eventId)
      .single()

    if (eventErr) {
      if (eventErr.code === 'PGRST116') return reply.code(404).send(formatError('Event not found'))
      throw eventErr
    }

    if (event.status === 'cancelled') {
      return reply.code(400).send(formatError('Event has been cancelled'))
    }

    if (event.capacity > 0 && event.registered_count >= event.capacity) {
      return reply.code(409).send(formatError('Event is at full capacity'))
    }

    // Check if already registered
    const { data: existing } = await request.supabase
      .from('event_registrations')
      .select('id')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .single()

    if (existing) {
      return reply.code(409).send(formatError('Already registered for this event'))
    }

    // Create registration
    const { data, error } = await request.supabase
      .from('event_registrations')
      .insert({ user_id: userId, event_id: eventId, registered_at: new Date().toISOString() })
      .select()
      .single()

    if (error) throw error

    // Increment registered_count
    await request.supabase.rpc('increment_event_registered_count', { eid: eventId })

    request.log.info({ userId, eventId }, 'User registered for event')
    return reply.code(201).send(formatResponse(data))
  }))

  /** DELETE /events/:id/register — Cancel event registration */
  fastify.delete<{ Params: { id: string } }>('/events/:id/register', wrapHandler('Failed to cancel registration', async (request, reply) => {
    const userId = request.user!.id
    const { id: eventId } = request.params as { id: string }

    const { error } = await request.supabase
      .from('event_registrations')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId)

    if (error) throw error

    // Decrement registered_count
    await request.supabase.rpc('decrement_event_registered_count', { eid: eventId })

    return reply.send(formatResponse({ cancelled: true }))
  }))
}

export default userEventsRoutes
