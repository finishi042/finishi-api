import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { requirePlan } from '../../shared/middleware/require-plan.js'
import { SubmitQuizSchema } from '../schemas.js'

const learningQuizzesRoutes: FastifyPluginAsync = async (fastify) => {
  /** POST /quizzes/:id/submit — Submit quiz answers and get results */
  fastify.post<{ Params: { id: string } }>('/quizzes/:id/submit', async (request, reply) => {
    const parsed = SubmitQuizSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to submit quiz', async (req, rep) => {
      const userId = req.user!.id
      const { id: quizId } = req.params as { id: string }
      const { answers } = parsed.data

      // Fetch quiz with correct answers
      const { data: quiz, error: quizErr } = await req.supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single()

      if (quizErr) {
        if (quizErr.code === 'PGRST116') return rep.code(404).send(formatError('Quiz not found'))
        throw quizErr
      }

      // Grade the quiz
      const questions = quiz.questions as Array<{ id: string; correct_answer: string }>
      let correctCount = 0
      const results = questions.map((q) => {
        const userAnswer = answers.find((a) => a.question_id === q.id)?.answer
        const isCorrect = userAnswer === q.correct_answer
        if (isCorrect) correctCount++
        return { question_id: q.id, user_answer: userAnswer ?? null, correct: isCorrect }
      })

      const score = Math.round((correctCount / questions.length) * 100)
      const passed = score >= (quiz.passing_score ?? 70)

      // Save attempt
      const { data: attempt, error: attemptErr } = await req.supabase
        .from('quiz_attempts')
        .insert({
          user_id: userId,
          quiz_id: quizId,
          lesson_id: quiz.lesson_id,
          answers: results,
          score,
          passed,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (attemptErr) throw attemptErr

      req.log.info({ userId, quizId, score, passed }, 'Quiz submitted')

      return rep.send(
        formatResponse({
          attempt_id: attempt.id,
          score,
          passed,
          correct_count: correctCount,
          total_questions: questions.length,
          results,
        })
      )
    })(request, reply)
  })

  /** GET /quizzes/:id/attempts — Get user's past attempts for a quiz (Pro plan required) */
  fastify.get<{ Params: { id: string } }>('/quizzes/:id/attempts', { onRequest: [requirePlan('pro')] }, wrapHandler('Failed to fetch quiz attempts', async (request, reply) => {
    const userId = request.user!.id
    const { id: quizId } = request.params as { id: string }

    const { data, error } = await request.supabase
      .from('quiz_attempts')
      .select('id, score, passed, completed_at')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .order('completed_at', { ascending: false })

    if (error) throw error
    return reply.send(formatResponse(data))
  }))
}

export default learningQuizzesRoutes
