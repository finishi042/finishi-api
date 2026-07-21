import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireAdmin } from '../shared/middleware/rbac.js'

// Sub-route modules — each handles a single resource (SRP)
import adminUsersRoutes from './routes/users.js'
import adminAnalyticsRoutes from './routes/analytics.js'
import adminSkillsRoutes from './routes/skills.js'
import adminLessonsRoutes from './routes/lessons.js'
import adminLearningPathsRoutes from './routes/learning-paths.js'
import adminLearningPathCoursesRoutes from './routes/learning-path-courses.js'
import adminCoursesRoutes from './routes/courses.js'
import adminQuizzesRoutes from './routes/quizzes.js'
import adminBroadcastRoutes from './routes/broadcast.js'
import adminEventsRoutes from './routes/events.js'
import adminWaitlistRoutes from './routes/waitlist.js'
import adminImpressionsRoutes from './routes/impressions.js'
import adminNotificationRoutes from './notifications/routes.js'
import adminPaymentConfigRoutes from './routes/payment-config.js'
import adminSubscriptionPlansRoutes from './routes/subscription-plans.js'
import adminMonitoringRoutes from './routes/monitoring.js'

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
  await fastify.register(adminLearningPathCoursesRoutes)
  await fastify.register(adminCoursesRoutes)
  await fastify.register(adminQuizzesRoutes)
  await fastify.register(adminBroadcastRoutes)
  await fastify.register(adminEventsRoutes)
  await fastify.register(adminWaitlistRoutes)
  await fastify.register(adminImpressionsRoutes)
  await fastify.register(adminNotificationRoutes)
  await fastify.register(adminPaymentConfigRoutes)
  await fastify.register(adminSubscriptionPlansRoutes)
  await fastify.register(adminMonitoringRoutes)
}

export default adminRoutes
