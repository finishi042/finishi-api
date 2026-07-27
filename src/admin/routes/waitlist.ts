import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import type { WaitlistEntry } from '../types.js'
import { WaitlistStatusSchema, WaitlistInviteSchema, WaitlistQuerySchema } from '../schemas.js'
import { sendEmailBatch } from '../email/service.js'
import { inviteTemplate } from '../email/templates.js'

const adminWaitlistRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /waitlist */
  fastify.get('/waitlist', wrapHandler('Failed to fetch waitlist', async (request, reply) => {
    const q = WaitlistQuerySchema.safeParse(request.query)

    let query = request.supabase
      .from('waitlist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (q.success) {
      if (q.data.status && q.data.status !== 'all') query = query.eq('status', q.data.status)
      if (q.data.search)
        query = query.or(`email.ilike.%${q.data.search}%`)
    }

    const { data, error, count } = await query
    if (error) throw error
    return reply.send({ ...formatResponse(data as WaitlistEntry[]), meta: { total: count ?? 0 } })
  }))

  /** PATCH /waitlist/:id/status */
  fastify.patch<{ Params: { id: string } }>('/waitlist/:id/status', async (request, reply) => {
    const parsed = WaitlistStatusSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to update waitlist status', async (req, rep) => {
      const { id } = req.params as { id: string }
      const { data, error } = await req.supabase
        .from('waitlist')
        .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) {
        if (error.code === 'PGRST116') return rep.code(404).send(formatError('Entry not found'))
        throw error
      }
      return rep.send(formatResponse(data as WaitlistEntry))
    })(request, reply)
  })

  /** POST /waitlist/invite — approve + send invite emails */
  fastify.post('/waitlist/invite', async (request, reply) => {
    const parsed = WaitlistInviteSchema.safeParse(request.body)
    if (!parsed.success)
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))

    return wrapHandler('Failed to send invites', async (req, rep) => {
      // 1. Mark waitlist entries as approved
      const { data, error } = await req.supabase
        .from('waitlist')
        .update({ status: 'approved', invite_sent_at: new Date().toISOString() })
        .in('email', parsed.data.emails)
        .select()
      if (error) throw error

      // 2. Build and send invite emails
      const frontendUrl = fastify.config.FRONTEND_URL ?? 'https://app.finishi.com'
      const defaultMessage =
        "You've been invited to join Finishi — an AI-powered micro-learning platform. Start your learning journey today!"
      const messageText = parsed.data.message ?? defaultMessage
      const { subject, html } = inviteTemplate({
        message: messageText,
        skill: parsed.data.skill,
        ctaUrl: `${frontendUrl}/signup`,
      })

      const emailResult = await sendEmailBatch(
        parsed.data.emails,
        parsed.data.subject ?? subject,
        html,
        { apiKey: fastify.config.RESEND_API_KEY, from: fastify.config.EMAIL_FROM },
      )

      req.log.info(
        { invited: data?.length ?? 0, emailsSent: emailResult.sent, emailsFailed: emailResult.failed },
        'Waitlist invites processed',
      )

      return rep.send(
        formatResponse({
          invited: data?.length ?? 0,
          emails: parsed.data.emails,
          email_sent: emailResult.sent,
          email_failed: emailResult.failed,
          ...(emailResult.errors.length > 0 ? { email_errors: emailResult.errors } : {}),
        }),
      )
    })(request, reply)
  })
}

export default adminWaitlistRoutes
