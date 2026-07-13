/**
 * Google OAuth routes.
 * Uses Supabase Auth's built-in Google provider support.
 *
 * Flow:
 *   1. GET /auth/google — redirects user to Google consent screen via Supabase
 *   2. GET /auth/google/callback — exchanges code for session, sets httpOnly cookies, redirects to frontend
 */
import type { FastifyPluginAsync } from 'fastify'
import { getSupabase } from '../shared/supabase.js'
import { provisionUser } from './onboarding.js'
import { notifyAdminUserSignup } from '../admin/notifications/emitter.js'
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  sessionCookieOptions,
  refreshCookieOptions,
} from './cookie.js'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'

const googleAuthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /auth/google
   * Initiates the Google OAuth flow by redirecting to Google's consent screen.
   */
  fastify.get('/google', async (request, reply) => {
    const supabase = getSupabase()

    const redirectTo =
      process.env.GOOGLE_REDIRECT_URL ??
      `${request.protocol}://${request.hostname}/api/v1/auth/google/callback`

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error || !data.url) {
      request.log.error({ error }, 'Failed to initiate Google OAuth')
      return reply.code(500).send({
        success: false,
        error: { message: 'Failed to initiate Google sign-in', code: 'OAUTH_ERROR' },
      })
    }

    return reply.redirect(data.url)
  })

  /**
   * GET /auth/google/callback
   * Supabase redirects here with code in query params.
   * Exchanges the code for a session, provisions user, sets cookies, redirects to frontend.
   */
  fastify.get('/google/callback', async (request, reply) => {
    const { code } = request.query as { code?: string }

    if (!code) {
      request.log.warn('Google callback missing code parameter')
      return reply.redirect(`${FRONTEND_URL}/login?error=missing_code`)
    }

    const supabase = getSupabase()

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.session) {
      request.log.error({ error }, 'Google OAuth code exchange failed')
      return reply.redirect(`${FRONTEND_URL}/login?error=auth_failed`)
    }

    const { session, user } = data

    // Provision user in application database (no-op if already exists)
    try {
      await provisionUser({
        id: user.id,
        email: user.email!,
        full_name: (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string) ?? undefined,
        avatar_url: (user.user_metadata?.avatar_url as string) ?? (user.user_metadata?.picture as string) ?? undefined,
      })
    } catch (err) {
      request.log.error({ err, userId: user.id }, 'Failed to provision Google OAuth user')
      // Non-fatal — user can still log in, provisioning may have raced
    }

    // Set httpOnly session cookies
    reply.setCookie(COOKIE_NAME, session.access_token, sessionCookieOptions())
    reply.setCookie(REFRESH_COOKIE_NAME, session.refresh_token, refreshCookieOptions())

    request.log.info({ userId: user.id, email: user.email }, 'User signed in via Google')

    // Notify admins for new users (check if recently created)
    const createdAt = new Date(user.created_at)
    const isNewUser = Date.now() - createdAt.getTime() < 60_000 // created within last minute
    if (isNewUser) {
      notifyAdminUserSignup(
        user.id,
        user.email!,
        (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string)
      )
    }

    // Redirect to frontend app
    return reply.redirect(`${FRONTEND_URL}/`)
  })
}

export default googleAuthRoutes
