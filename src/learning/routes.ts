import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'

// Sub-route modules — each handles a single learning sub-domain (SRP)
import learningCoursesRoutes from './routes/courses.js'
import learningLessonsRoutes from './routes/lessons.js'
import learningPathRoutes from './routes/learning-path.js'
import learningProgressRoutes from './routes/progress.js'
import learningQuizzesRoutes from './routes/quizzes.js'

/**
 * Learning routes aggregator.
 * Authentication and authorisation are applied once here;
 * individual sub-modules focus only on their domain logic.
 */
const learningRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireUser)

  await fastify.register(learningCoursesRoutes)
  await fastify.register(learningLessonsRoutes)
  await fastify.register(learningPathRoutes)
  await fastify.register(learningProgressRoutes)
  await fastify.register(learningQuizzesRoutes)
}

export default learningRoutes
