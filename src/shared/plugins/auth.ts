import fp from 'fastify-plugin'
import fastifyJWT from '@fastify/jwt'
import type { FastifyPluginAsync } from 'fastify'

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const { SUPABASE_JWT_SECRET } = fastify.config

  await fastify.register(fastifyJWT, {
    secret: SUPABASE_JWT_SECRET,
    verify: {
      algorithms: ['HS256'],
    },
  })

  fastify.log.info('JWT authentication configured')
}

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['supabase'],
})
