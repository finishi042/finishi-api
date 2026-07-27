import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { z } from 'zod'

const AssistantAskSchema = z.object({
  question: z.string().min(3, 'Question must be at least 3 characters').max(500),
  lesson_id: z.string().uuid(),
})

/**
 * F8: AI Learning Assistant
 *
 * Built-in AI tutor for lesson-related questions.
 * Supports: "What does this mean?", "Give me another example", "Explain this simply"
 */
const assistantRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /assistant/ask — Ask the AI assistant a question about the current lesson
   */
  fastify.post('/assistant/ask', async (request, reply) => {
    const parsed = AssistantAskSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to get assistant response', async (req, rep) => {
      const userId = req.user!.id
      const { question, lesson_id } = parsed.data

      // Fetch the lesson for context
      const { data: lesson, error: lessonErr } = await req.supabase
        .from('lessons')
        .select('*, node:skill_graph_nodes(concept, description)')
        .eq('id', lesson_id)
        .single()

      if (lessonErr || !lesson) {
        return rep.code(404).send(formatError('Lesson not found'))
      }

      // Get user's experience level from their learning path
      const { data: path } = await req.supabase
        .from('learning_paths')
        .select('experience_level')
        .eq('user_id', userId)
        .eq('skill_id', lesson.skill_id)
        .single()

      const experienceLevel = (path?.experience_level || 'beginner') as 'beginner' | 'intermediate' | 'advanced'

      // Build lesson context from stored content
      let lessonContext = lesson.content || ''
      if (typeof lessonContext === 'string') {
        try {
          const parsed = JSON.parse(lessonContext)
          lessonContext = `${parsed.explanation || ''}\n\nExample: ${parsed.example || ''}\n\nKey Takeaway: ${parsed.key_takeaway || ''}`
        } catch {
          // content is plain text, use as-is
        }
      }

      const conceptName = lesson.node?.concept || lesson.title

      // Ask AI
      const ai = req.server.ai
      const response = await ai.assistantChat({
        question,
        lessonContext,
        conceptName,
        experienceLevel,
      })

      req.log.info({ userId, lesson_id, questionLength: question.length }, 'Assistant question answered')

      return rep.send(formatResponse({
        answer: response.answer,
        concept: conceptName,
        lesson_title: lesson.title,
      }))
    })(request, reply)
  })
}

export default assistantRoutes
