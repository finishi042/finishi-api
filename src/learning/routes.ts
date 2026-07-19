import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { requireUser } from '../shared/middleware/rbac.js'

// Sub-route modules — each handles a single learning sub-domain (SRP)
import learningCoursesRoutes from './routes/courses.js'
import learningLessonsRoutes from './routes/lessons.js'
import learningPathRoutes from './routes/learning-path.js'
import learningProgressRoutes from './routes/progress.js'
import learningQuizzesRoutes from './routes/quizzes.js'
import learningSkillsRoutes from './routes/skills.js'
import lessonAttemptsRoutes from './routes/lesson-attempts.js'
import personalizationRoutes from './routes/personalization.js'
import onboardingRoutes from './routes/onboarding.js'
import capstoneRoutes from './routes/capstone.js'
import completionRoutes from './routes/completion.js'
import assistantRoutes from './routes/assistant.js'
import conceptChecklistRoutes from './routes/concept-checklist.js'

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
  await fastify.register(learningSkillsRoutes)
  await fastify.register(lessonAttemptsRoutes)
  await fastify.register(personalizationRoutes)
  await fastify.register(onboardingRoutes)
  await fastify.register(capstoneRoutes)
  await fastify.register(completionRoutes)
  await fastify.register(assistantRoutes)
  await fastify.register(conceptChecklistRoutes)
}

export default learningRoutes
