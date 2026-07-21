/**
 * AI Chat Routes
 *
 * Provides the /ai/chat endpoint for the AI Tutor feature.
 * Requires authentication — the user must be logged in.
 * Protected by guardrails: input filtering, topic boundaries, per-user rate limits.
 */

import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import type { AIMessage } from './types.js'
import {
  filterInput,
  validateResponse,
  checkUserRateLimit,
  cleanupRateLimitEntries,
  FINISHI_SYSTEM_PROMPT,
} from './guardrails.js'

interface ChatRequestBody {
  messages: AIMessage[]
  context?: {
    lessonContent?: string
    conceptName?: string
    experienceLevel?: 'beginner' | 'intermediate' | 'advanced'
  }
}

interface ChatResponseData {
  reply: string
  provider: string
  model: string
}

const aiChatRoutes: FastifyPluginAsync = async (fastify) => {
  // All AI chat routes require authentication
  fastify.addHook('onRequest', authenticate)

  // Cleanup stale rate limit entries every 5 minutes
  const cleanupInterval = setInterval(cleanupRateLimitEntries, 5 * 60 * 1000)
  fastify.addHook('onClose', () => clearInterval(cleanupInterval))

  /**
   * POST /ai/chat
   *
   * Send a message to the AI tutor and get a response.
   * Supports both free-form chat and lesson-contextual Q&A.
   */
  fastify.post<{ Body: ChatRequestBody }>('/chat', async (request, reply) => {
    const { messages, context } = request.body
    const userId = (request as any).userId as string

    // ── Per-user rate limit ──
    if (userId) {
      const rateCheck = checkUserRateLimit(userId)
      if (!rateCheck.allowed) {
        return reply.code(429).send({
          success: false,
          error: {
            message: "You're sending messages too quickly. Please wait a moment and try again.",
            code: 'RATE_LIMITED',
            retryAfterMs: rateCheck.retryAfterMs,
          },
        })
      }
    }

    // ── Input validation ──
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { message: 'messages array is required and must not be empty', code: 'VALIDATION_ERROR' },
      })
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return reply.code(400).send({
          success: false,
          error: { message: 'Each message must have role and content', code: 'VALIDATION_ERROR' },
        })
      }
      if (!['system', 'user', 'assistant'].includes(msg.role)) {
        return reply.code(400).send({
          success: false,
          error: { message: `Invalid role: ${msg.role}`, code: 'VALIDATION_ERROR' },
        })
      }
    }

    // ── Content guardrails ──
    // Filter the latest user message
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUserMessage) {
      const filterResult = filterInput(lastUserMessage.content)
      if (!filterResult.allowed) {
        // Return the guardrail message directly — no API call needed
        return reply.send({
          success: true,
          data: {
            reply: filterResult.reason!,
            provider: 'guardrail',
            model: 'content-filter',
          } satisfies ChatResponseData,
        })
      }
    }

    // Strip any user-injected system messages (only our system prompt is allowed)
    const userMessages = messages.filter((m) => m.role !== 'system')

    try {
      // If lesson context is provided, use the assistantChat method
      if (context?.lessonContent && context?.conceptName) {
        if (!lastUserMessage) {
          return reply.code(400).send({
            success: false,
            error: { message: 'At least one user message is required', code: 'VALIDATION_ERROR' },
          })
        }

        const result = await fastify.ai.assistantChat({
          question: lastUserMessage.content,
          lessonContext: context.lessonContent,
          conceptName: context.conceptName,
          experienceLevel: context.experienceLevel || 'beginner',
        })

        const validatedReply = validateResponse(result.answer)

        return reply.send({
          success: true,
          data: {
            reply: validatedReply,
            provider: fastify.ai.name,
            model: 'contextual',
          } satisfies ChatResponseData,
        })
      }

      // Free-form chat — always use OUR system prompt (never the client's)
      const systemMessage: AIMessage = {
        role: 'system',
        content: FINISHI_SYSTEM_PROMPT,
      }

      const fullMessages: AIMessage[] = [systemMessage, ...userMessages]

      const result = await fastify.ai.complete({
        messages: fullMessages,
        temperature: 0.7,
        maxTokens: 1024,
      })

      const validatedReply = validateResponse(result.content)

      return reply.send({
        success: true,
        data: {
          reply: validatedReply,
          provider: result.provider,
          model: result.model,
        } satisfies ChatResponseData,
      })
    } catch (error) {
      request.log.error({ error }, 'AI chat error')
      return reply.code(502).send({
        success: false,
        error: { message: 'AI service temporarily unavailable. Please try again.', code: 'AI_ERROR' },
      })
    }
  })

  /**
   * POST /ai/generate-quiz
   *
   * Generate quiz questions from a topic or lesson content.
   */
  fastify.post<{ Body: { topic: string; difficulty?: string; count?: number } }>(
    '/generate-quiz',
    async (request, reply) => {
      const { topic, difficulty = 'beginner', count = 5 } = request.body
      const userId = (request as any).userId as string

      // Rate limit
      if (userId) {
        const rateCheck = checkUserRateLimit(userId)
        if (!rateCheck.allowed) {
          return reply.code(429).send({
            success: false,
            error: { message: "Too many requests. Please wait a moment.", code: 'RATE_LIMITED' },
          })
        }
      }

      if (!topic) {
        return reply.code(400).send({
          success: false,
          error: { message: 'topic is required', code: 'VALIDATION_ERROR' },
        })
      }

      // Content filter on topic
      const filterResult = filterInput(topic)
      if (!filterResult.allowed) {
        return reply.code(400).send({
          success: false,
          error: { message: filterResult.reason, code: 'CONTENT_FILTERED' },
        })
      }

      try {
        const result = await fastify.ai.complete({
          messages: [
            {
              role: 'system',
              content: `You are a quiz generator for a tech learning platform called Finishi. Generate exactly ${count} multiple-choice questions about the given technology/programming topic at the ${difficulty} level. Only generate quizzes about technology, programming, design, or career development topics. If the topic is unrelated, respond with: { "questions": [], "error": "Topic must be related to technology or learning." }

Output valid JSON with this structure:
{ "questions": [{ "question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..." }] }`,
            },
            { role: 'user', content: `Generate a quiz about: ${topic}` },
          ],
          responseFormat: 'json',
          temperature: 0.7,
          maxTokens: 2048,
        })

        const parsed = JSON.parse(result.content)
        return reply.send({ success: true, data: parsed })
      } catch (error) {
        request.log.error({ error }, 'AI quiz generation error')
        return reply.code(502).send({
          success: false,
          error: { message: 'Failed to generate quiz. Please try again.', code: 'AI_ERROR' },
        })
      }
    }
  )

  /**
   * POST /ai/summarize
   *
   * Summarize lesson content or a topic.
   */
  fastify.post<{ Body: { content: string; style?: 'brief' | 'detailed' | 'bullet-points' } }>(
    '/summarize',
    async (request, reply) => {
      const { content, style = 'brief' } = request.body
      const userId = (request as any).userId as string

      // Rate limit
      if (userId) {
        const rateCheck = checkUserRateLimit(userId)
        if (!rateCheck.allowed) {
          return reply.code(429).send({
            success: false,
            error: { message: "Too many requests. Please wait a moment.", code: 'RATE_LIMITED' },
          })
        }
      }

      if (!content) {
        return reply.code(400).send({
          success: false,
          error: { message: 'content is required', code: 'VALIDATION_ERROR' },
        })
      }

      // Content filter
      const filterResult = filterInput(content)
      if (!filterResult.allowed) {
        return reply.code(400).send({
          success: false,
          error: { message: filterResult.reason, code: 'CONTENT_FILTERED' },
        })
      }

      const styleInstructions = {
        brief: 'Provide a concise 2-3 sentence summary.',
        detailed: 'Provide a comprehensive summary covering all key points (200-300 words).',
        'bullet-points': 'Provide a summary as a clear bullet-point list of key takeaways.',
      }

      try {
        const result = await fastify.ai.complete({
          messages: [
            { role: 'system', content: `You are a summarization assistant for a tech learning platform. ${styleInstructions[style]} Only summarize content related to technology, programming, or learning topics.` },
            { role: 'user', content: `Summarize this:\n\n${content}` },
          ],
          temperature: 0.3,
          maxTokens: 512,
        })

        const validatedReply = validateResponse(result.content)

        return reply.send({
          success: true,
          data: { summary: validatedReply, style },
        })
      } catch (error) {
        request.log.error({ error }, 'AI summarize error')
        return reply.code(502).send({
          success: false,
          error: { message: 'Failed to summarize. Please try again.', code: 'AI_ERROR' },
        })
      }
    }
  )
}

export default aiChatRoutes
