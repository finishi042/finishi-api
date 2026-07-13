import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireAdmin } from '../shared/middleware/rbac.js'

// Sub-route modules — each handles a single resource (SRP)
import adminUsersRoutes from './routes/users.js'
import adminAnalyticsRoutes from './routes/analytics.js'
import adminSkillsRoutes from './routes/skills.js'
import adminLessonsRoutes from './routes/lessons.js'
import adminLearningPathsRoutes from './routes/learning-paths.js'
import adminEventsRoutes from './routes/events.js'
import adminWaitlistRoutes from './routes/waitlist.js'
import adminImpressionsRoutes from './routes/impressions.js'
import adminNotificationRoutes from './notifications/routes.js'

/**
 * Admin routes aggregator.
 * Authentication and authorisation are applied once here;
 * individual sub-modules focus only on their domain logic.
 */
const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireAdmin)

  await fastify.register(adminUsersRoutes)
  await fastify.register(adminAnalyticsRoutes)
  await fastify.register(adminSkillsRoutes)
  await fastify.register(adminLessonsRoutes)
  await fastify.register(adminLearningPathsRoutes)
  await fastify.register(adminEventsRoutes)
  await fastify.register(adminWaitlistRoutes)
  await fastify.register(adminImpressionsRoutes)
  await fastify.register(adminNotificationRoutes)
}

export default adminRoutes
