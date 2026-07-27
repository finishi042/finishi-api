import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { SendEmailSchema } from '../schemas.js'
import { sendEmailBatch } from '../email/service.js'
import { generalTemplate, inviteTemplate, welcomeTemplate } from '../email/templates.js'

const adminEmailRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /email/send
   * Send a custom or templated email to any list of recipients.
   * Works for both onboarded users and waitlist entries.
   */
  fastify.post('/email/send', async (request, reply) => {
    const parsed = SendEmailSchema.safeParse(request.body)
    if (!parsed.success)
      {return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))}

    return wrapHandler('Failed to send email', async (req, rep) => {
      const { emails, subject, message, template, cta_label, cta_url, skill } = parsed.data
      const frontendUrl = fastify.config.FRONTEND_URL ?? 'https://app.finishi.com'

      let html: string

      if (template === 'invite') {
        const t = inviteTemplate({
          message,
          skill,
          ctaUrl: cta_url ?? `${frontendUrl}/signup`,
        })
        html = t.html
      } else if (template === 'welcome') {
        const t = welcomeTemplate({
          name: '',           // bulk send — no personalisation at this level
          ctaUrl: cta_url ?? `${frontendUrl}/dashboard`,
        })
        html = t.html
      } else {
        const t = generalTemplate({
          subject,
          message,
          ctaLabel: cta_label,
          ctaUrl: cta_url,
        })
        html = t.html
      }

      const result = await sendEmailBatch(
        emails,
        subject,
        html,
        { apiKey: fastify.config.RESEND_API_KEY, from: fastify.config.EMAIL_FROM },
      )

      req.log.info(
        { sent: result.sent, failed: result.failed, adminId: req.user?.id },
        'Admin bulk email dispatched',
      )

      if (result.failed > 0 && result.sent === 0) {
        return rep
          .code(502)
          .send(formatError(`Email delivery failed: ${result.errors.join('; ')}`, 'EMAIL_ERROR'))
      }

      return rep.send(
        formatResponse({
          sent: result.sent,
          failed: result.failed,
          total: emails.length,
          ...(result.errors.length > 0 ? { errors: result.errors } : {}),
        }),
      )
    })(request, reply)
  })
}

export default adminEmailRoutes
