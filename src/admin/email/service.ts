import { Resend } from 'resend'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

let _client: Resend | null = null

function getClient(apiKey: string): Resend {
  if (!_client) _client = new Resend(apiKey)
  return _client
}

export async function sendEmail(
  opts: SendEmailOptions,
  config: { apiKey: string; from: string }
): Promise<SendEmailResult> {
  if (!config.apiKey || config.apiKey === 're_your_resend_api_key') {
    // Dev / unconfigured — log and succeed silently so other logic still runs
    console.warn('[email] RESEND_API_KEY not configured — email not sent:', {
      to: opts.to,
      subject: opts.subject,
    })
    return { success: true, id: 'dev-no-op' }
  }

  const client = getClient(config.apiKey)
  const { data, error } = await client.emails.send({
    from: config.from,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
  })

  if (error) return { success: false, error: error.message }
  return { success: true, id: data?.id }
}

/**
 * Send to multiple recipients in batches of 50 (Resend batch limit).
 * Returns counts of successes and failures.
 */
export async function sendEmailBatch(
  recipients: string[],
  subject: string,
  html: string,
  config: { apiKey: string; from: string }
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const BATCH = 50
  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH)
    const result = await sendEmail({ to: batch, subject, html }, config)
    if (result.success) {
      sent += batch.length
    } else {
      failed += batch.length
      if (result.error) errors.push(result.error)
    }
  }

  return { sent, failed, errors }
}
