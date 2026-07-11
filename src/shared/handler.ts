import type { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify'
import { formatResponse, formatError } from './supabase.js'

/**
 * Wraps a route handler with standardised error handling.
 * Eliminates the repeated try/catch + request.log.error + formatError pattern.
 *
 * Usage:
 *   fastify.get<{ Params: { id: string } }>('/path', wrapHandler('Failed to do X', async (request, reply) => {
 *     const { id } = request.params // fully typed
 *     return reply.send(formatResponse(data))
 *   }))
 */
export function wrapHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface>(
  errorMessage: string,
  handler: (request: FastifyRequest<RouteGeneric>, reply: FastifyReply) => Promise<unknown>
) {
  return async (request: FastifyRequest<RouteGeneric>, reply: FastifyReply) => {
    try {
      return await handler(request, reply)
    } catch (error) {
      request.log.error({ error }, errorMessage)
      return reply.code(500).send(formatError(errorMessage))
    }
  }
}

export { formatResponse, formatError }
