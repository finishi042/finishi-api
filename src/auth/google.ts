/**
 * Google OAuth routes.
 * 
 * Strategy: Redirect the user to Supabase's OAuth endpoint directly.
 * Supabase handles the Google OAuth dance and redirects back to our API
 * callback with access_token and refresh_token in the URL fragment/query.
 *
 * Since Supabase returns tokens in the URL hash (implicit flow) by default,
 * we serve a tiny HTML page at the callback that reads the hash fragment
 * and posts the tokens to a server endpoint that sets httpOnly cookies.
 *
 * Flow:
 *   1. GET /auth/google — redirects to Supabase OAuth URL
 *   2. GET /auth/google/callback — serves HTML that extracts tokens from hash
 *   3. POST /auth/google/session — receives tokens, sets cookies, returns redirect URL
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
   * Redirects to Supabase's Google OAuth endpoint.
   */
  fastify.get('/google', async (_request, reply) => {
    const supabaseUrl = process.env.SUPABASE_URL!
    const redirectTo =
      process.env.GOOGLE_REDIRECT_URL ??
      `http://localhost:3000/api/v1/auth/google/callback`

    // Redirect directly to Supabase's OAuth endpoint
    const oauthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`

    return reply.redirect(oauthUrl)
  })

  /**
   * GET /auth/google/callback
   * Supabase redirects here with tokens in the URL hash fragment.
   * We serve a small HTML page that extracts the tokens and posts them
   * to our session endpoint.
   */
  fastify.get('/google/callback', async (request, reply) => {
    // Check if tokens came as query params (code flow)
    const query = request.query as Record<string, string | undefined>
    
    if (query.access_token && query.refresh_token) {
      // Tokens in query params — handle directly
      return handleTokens(query.access_token, query.refresh_token, request, reply)
    }

    // Tokens are in the hash fragment — serve HTML to extract them
    const html = `<!DOCTYPE html>
<html>
<head><title>Signing in...</title></head>
<body>
<p>Completing sign-in...</p>
<script>
  // Supabase puts tokens in the URL hash fragment
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');

  if (access_token && refresh_token) {
    fetch('/api/v1/auth/google/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ access_token, refresh_token })
    })
    .then(res => res.json())
    .then(data => {
      window.location.href = data.redirect || '${FRONTEND_URL}/';
    })
    .catch(() => {
      window.location.href = '${FRONTEND_URL}/login?error=session_failed';
    });
  } else {
    window.location.href = '${FRONTEND_URL}/login?error=missing_tokens';
  }
</script>
</body>
</html>`

    return reply.type('text/html').send(html)
  })

  /**
   * POST /auth/google/session
   * Receives tokens from the callback page, verifies the user,
   * provisions them, sets httpOnly cookies, and returns a redirect URL.
   */
  fastify.post('/google/session', async (request, reply) => {
    const { access_token, refresh_token } = request.body as {
      access_token?: string
      refresh_token?: string
    }

    if (!access_token || !refresh_token) {
      return reply.code(400).send({
        success: false,
        error: { message: 'Missing tokens', code: 'MISSING_TOKENS' },
      })
    }

    return handleTokens(access_token, refresh_token, request, reply)
  })

  async function handleTokens(
    accessToken: string,
    refreshToken: string,
    request: any,
    reply: any
  ) {
    const supabase = getSupabase()

    // Verify the access token to get user info
    const { data: { user }, error } = await supabase.auth.getUser(accessToken)

    if (error || !user) {
      request.log.error({ error }, 'Google OAuth token verification failed')
      return reply.code(401).send({
        success: false,
        error: { message: 'Invalid token', code: 'INVALID_TOKEN' },
        redirect: `${FRONTEND_URL}/login?error=auth_failed`,
      })
    }

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
    }

    // Set httpOnly session cookies
    reply.setCookie(COOKIE_NAME, accessToken, sessionCookieOptions())
    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions())

    request.log.info({ userId: user.id, email: user.email }, 'User signed in via Google')

    // Notify admins for new users
    const createdAt = new Date(user.created_at)
    const isNewUser = Date.now() - createdAt.getTime() < 60_000
    if (isNewUser) {
      notifyAdminUserSignup(
        user.id,
        user.email!,
        (user.user_metadata?.full_name as string) ?? (user.user_metadata?.name as string)
      )
    }

    return reply.send({ success: true, redirect: `${FRONTEND_URL}/` })
  }
}

export default googleAuthRoutes
