/**
 * Auth routes — public (no authenticate middleware).
 * Handles signup, login, logout, and token refresh.
 * Tokens are set as httpOnly cookies (not returned in body).
 * All responses are validated through output schemas before sending.
 */
import crypto from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError } from '../shared/supabase.js'
import { getSupabase } from '../shared/supabase.js'
import {
  SignupSchema,
  LoginSchema,
  ForgotPasswordSchema,
  VerifyOtpSchema,
  ResetPasswordSchema,
  UpdatePasswordSchema,
  SignupOutput,
  LoginOutput,
  LogoutOutput,
  RefreshOutput,
  ForgotPasswordOutput,
  VerifyOtpOutput,
  ResetPasswordOutput,
  UpdatePasswordOutput,
  MeOutput,
} from './schemas.js'
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  sessionCookieOptions,
  refreshCookieOptions,
} from './cookie.js'
import { establishSession, clearSession } from './session.js'

// OTP hashing utilities
async function hashOtp(otp: string): Promise<string> {
  return crypto.createHash('sha256').update(otp).digest('hex')
}

async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(hash))
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/signup
   * Create a new account and provision application-level user rows.
   */
  fastify.post('/signup', async (request, reply) => {
    const parsed = SignupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email, password, full_name } = parsed.data
    const supabase = getSupabase()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (authError) {
      request.log.error({ error: authError }, 'Signup failed')
      const status = authError.message.includes('already registered') ? 409 : 400
      return reply.code(status).send(formatError(authError.message, 'AUTH_ERROR'))
    }

    const user = authData.user

    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !session.session) {
      request.log.warn({ error: signInError }, 'Signup succeeded but auto-login failed')
      const output = SignupOutput.parse({ user_id: user.id, email: user.email, full_name: full_name ?? null })
      return reply.code(201).send(formatResponse(output))
    }

    await establishSession(reply, request, {
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
      user: { id: user.id, email: user.email!, full_name },
      isNewUser: true,
    })

    request.log.info({ userId: user.id }, 'User signed up and logged in')

    const output = SignupOutput.parse({ user_id: user.id, email: user.email, full_name: full_name ?? null })
    return reply.code(201).send(formatResponse(output))
  })

  /**
   * POST /auth/login
   * Authenticate with email/password, set httpOnly session cookies.
   * Stricter rate limit: 10 requests per 15 minutes per IP to prevent brute force
   */
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        keyGenerator: (request: any) => request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email, password } = parsed.data
    const supabase = getSupabase()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.session) {
      return reply.code(401).send(formatError('Invalid email or password', 'INVALID_CREDENTIALS'))
    }

    const { session, user } = data

    await establishSession(reply, request, {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      user: {
        id: user.id,
        email: user.email!,
        full_name: (user.user_metadata?.full_name as string) ?? undefined,
        avatar_url: (user.user_metadata?.avatar_url as string) ?? undefined,
      },
      isNewUser: false,
    })

    request.log.info({ userId: user.id, email }, 'User logged in')

    const output = LoginOutput.parse({
      user_id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    })
    return reply.send(formatResponse(output))
  })

  /**
   * POST /auth/logout
   * Clear session cookies.
   */
  fastify.post('/logout', async (_request, reply) => {
    clearSession(reply)

    const output = LogoutOutput.parse({ logged_out: true })
    return reply.send(formatResponse(output))
  })

  /**
   * POST /auth/refresh
   * Use the refresh token cookie to get a new access token.
   */
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE_NAME]

    if (!refreshToken) {
      return reply.code(401).send(formatError('No refresh token', 'NO_REFRESH_TOKEN'))
    }

    const supabase = getSupabase()
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

    if (error || !data.session) {
      clearSession(reply)
      return reply.code(401).send(formatError('Refresh token expired or invalid', 'REFRESH_FAILED'))
    }

    reply.setCookie(COOKIE_NAME, data.session.access_token, sessionCookieOptions())
    reply.setCookie(REFRESH_COOKIE_NAME, data.session.refresh_token, refreshCookieOptions())

    const output = RefreshOutput.parse({ refreshed: true })
    return reply.send(formatResponse(output))
  })

  /**
   * GET /auth/me
   * Returns the current user info if authenticated.
   */
  fastify.get('/me', async (request, reply) => {
    const token = (request.cookies as Record<string, string | undefined>)?.[COOKIE_NAME]
      ?? request.headers.authorization?.substring(7)

    if (!token) {
      return reply.code(401).send(formatError('Not authenticated', 'UNAUTHORIZED'))
    }

    const supabase = getSupabase()
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return reply.code(401).send(formatError('Invalid session', 'UNAUTHORIZED'))
    }

    const output = MeOutput.parse({
      user_id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    })
    return reply.send(formatResponse(output))
  })

  /**
   * POST /auth/forgot-password
   * Generate and send a 6-digit OTP to the user's email.
   * Stricter rate limit: 5 requests per 15 minutes per IP
   */
  fastify.post('/forgot-password', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: (request: any) => request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = ForgotPasswordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email } = parsed.data
    const supabase = getSupabase()

    // Check if user exists
    const { data: user } = await supabase.auth.admin.listUsers()
    const userExists = user?.users?.some(u => u.email === email)

    if (!userExists) {
      return reply.code(404).send(formatError('No account found with this email address.', 'USER_NOT_FOUND'))
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in database
    await supabase.from('password_reset_otps').upsert({
      email,
      otp_hash: await hashOtp(otp),
      expires_at: expiresAt.toISOString(),
      attempts: 0,
      used: false,
      created_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    // Send OTP email
    try {
      const { Resend } = await import('resend')
      const { otpTemplate } = await import('../admin/email/templates.js')
      const resend = new Resend(fastify.config.RESEND_API_KEY)
      
      const { subject, html } = otpTemplate({ otp })
      
      await resend.emails.send({
        from: fastify.config.EMAIL_FROM,
        to: email,
        subject,
        html,
      })
      request.log.info({ email }, 'Password reset OTP sent')
    } catch (err) {
      request.log.error({ err, email }, 'Failed to send OTP email')
    }

    const output = ForgotPasswordOutput.parse({
      message: 'A verification code has been sent to your email.',
    })
    return reply.send(formatResponse(output))
  })

  /**
   * POST /auth/verify-otp
   * Verify that the OTP is valid (optional step, mainly for UX)
   */
  fastify.post('/verify-otp', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        keyGenerator: (request: any) => request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = VerifyOtpSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email, otp } = parsed.data
    const supabase = getSupabase()

    const { data: otpRecord } = await supabase
      .from('password_reset_otps')
      .select('*')
      .eq('email', email)
      .single()

    if (!otpRecord || otpRecord.used || new Date(otpRecord.expires_at) < new Date()) {
      return reply.send(formatResponse(VerifyOtpOutput.parse({
        valid: false,
        message: 'Invalid or expired code.',
      })))
    }

    // Verify OTP hash
    const isValid = await verifyOtp(otp, otpRecord.otp_hash)

    if (!isValid) {
      // Increment attempts
      await supabase
        .from('password_reset_otps')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('email', email)

      // Lock after 5 failed attempts
      if (otpRecord.attempts >= 4) {
        await supabase
          .from('password_reset_otps')
          .update({ used: true })
          .eq('email', email)
      }

      return reply.send(formatResponse(VerifyOtpOutput.parse({
        valid: false,
        message: 'Invalid code.',
      })))
    }

    return reply.send(formatResponse(VerifyOtpOutput.parse({
      valid: true,
      message: 'Code verified.',
    })))
  })

  /**
   * POST /auth/reset-password
   * Reset password using OTP verification.
   * Stricter rate limit: 10 requests per 15 minutes per IP
   */
  fastify.post('/reset-password', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        keyGenerator: (request: any) => request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = ResetPasswordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email, otp, password } = parsed.data
    const supabase = getSupabase()

    // Get OTP record
    const { data: otpRecord } = await supabase
      .from('password_reset_otps')
      .select('*')
      .eq('email', email)
      .single()

    if (!otpRecord) {
      return reply.code(400).send(formatError('No password reset request found. Please request a new code.', 'OTP_NOT_FOUND'))
    }

    if (otpRecord.used) {
      return reply.code(400).send(formatError('This code has already been used. Please request a new code.', 'OTP_USED'))
    }

    if (new Date(otpRecord.expires_at) < new Date()) {
      return reply.code(400).send(formatError('This code has expired. Please request a new code.', 'OTP_EXPIRED'))
    }

    if (otpRecord.attempts >= 5) {
      return reply.code(400).send(formatError('Too many failed attempts. Please request a new code.', 'OTP_LOCKED'))
    }

    // Verify OTP
    const isValid = await verifyOtp(otp, otpRecord.otp_hash)
    
    if (!isValid) {
      await supabase
        .from('password_reset_otps')
        .update({ attempts: otpRecord.attempts + 1 })
        .eq('email', email)

      return reply.code(400).send(formatError('Invalid code.', 'OTP_INVALID'))
    }

    // Find the user
    const { data: users } = await supabase.auth.admin.listUsers()
    const user = users?.users?.find(u => u.email === email)

    if (!user) {
      return reply.code(400).send(formatError('User not found.', 'USER_NOT_FOUND'))
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    })

    if (updateError) {
      request.log.error({ error: updateError }, 'Password reset failed')
      return reply.code(500).send(formatError('Failed to reset password.'))
    }

    // Mark OTP as used
    await supabase
      .from('password_reset_otps')
      .update({ used: true })
      .eq('email', email)

    request.log.info({ email }, 'Password reset successful via OTP')

    const output = ResetPasswordOutput.parse({
      message: 'Password has been reset successfully. Please log in with your new password.',
    })
    return reply.send(formatResponse(output))
  })

  /**
   * POST /auth/update-password
   * Update password for an authenticated user (requires current password).
   */
  fastify.post('/update-password', async (request, reply) => {
    const parsed = UpdatePasswordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { current_password, new_password } = parsed.data

    const token = (request.cookies as Record<string, string | undefined>)?.[COOKIE_NAME]
      ?? request.headers.authorization?.substring(7)

    if (!token) {
      return reply.code(401).send(formatError('Not authenticated', 'UNAUTHORIZED'))
    }

    const supabase = getSupabase()

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return reply.code(401).send(formatError('Invalid session', 'UNAUTHORIZED'))
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current_password,
    })

    if (verifyError) {
      return reply.code(400).send(formatError('Current password is incorrect', 'INVALID_PASSWORD'))
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    })

    if (updateError) {
      request.log.error({ error: updateError }, 'Password update failed')
      return reply.code(500).send(formatError('Failed to update password'))
    }

    request.log.info({ userId: user.id }, 'Password updated')

    const output = UpdatePasswordOutput.parse({
      message: 'Password updated successfully.',
    })
    return reply.send(formatResponse(output))
  })
}

export default authRoutes
