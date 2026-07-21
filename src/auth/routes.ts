/**
 * Auth routes — public (no authenticate middleware).
 * Handles signup, login, logout, and token refresh.
 * Tokens are set as httpOnly cookies (not returned in body).
 * All responses are validated through output schemas before sending.
 */
import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError } from '../shared/supabase.js'
import { getSupabase } from '../shared/supabase.js'
import {
  SignupSchema,
  LoginSchema,
  SignupOutput,
  LoginOutput,
  LogoutOutput,
  RefreshOutput,
  MeOutput,
} from './schemas.js'
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  sessionCookieOptions,
  refreshCookieOptions,
} from './cookie.js'
import { establishSession, clearSession } from './session.js'

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
   */
  fastify.post('/login', async (request, reply) => {
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
}

export default authRoutes
