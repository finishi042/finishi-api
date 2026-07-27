/**
 * Google OAuth routes — Direct Google Sign-In
 * 
 * Uses the standard Google OAuth 2.0 authorization code flow:
 *   1. GET /auth/google — redirects to Google's consent screen
 *   2. GET /auth/google/callback — exchanges code for tokens, creates Supabase session
 *
 * This gives users the familiar Google sign-in experience while still
 * using Supabase for user management and session storage.
 *
 * Required env vars:
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 *   - GOOGLE_REDIRECT_URL (e.g., https://api.finishi.org/api/v1/auth/google/callback)
 */
import type { FastifyPluginAsync } from 'fastify'
import { getSupabase } from '../shared/supabase.js'
import { establishSession } from './session.js'

interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope: string
  token_type: string
  id_token: string
}

interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name: string
  family_name: string
  picture: string
}

const googleAuthRoutes: FastifyPluginAsync = async (fastify) => {
  const getConfig = () => ({
    clientId: fastify.config?.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: fastify.config?.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUrl: fastify.config?.GOOGLE_REDIRECT_URL ?? process.env.GOOGLE_REDIRECT_URL ?? 'http://localhost:3000/api/v1/auth/google/callback',
    frontendUrl: fastify.config?.FRONTEND_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173',
  })

  /**
   * GET /auth/google
   * Redirects to Google's OAuth consent screen.
   */
  fastify.get('/google', async (_request, reply) => {
    const { clientId, redirectUrl } = getConfig()

    if (!clientId) {
      return reply.code(500).send({
        success: false,
        error: { message: 'Google OAuth not configured', code: 'CONFIG_ERROR' },
      })
    }

    const scope = [
      'openid',
      'email',
      'profile',
    ].join(' ')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUrl,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
    })

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return reply.redirect(googleAuthUrl)
  })

  /**
   * GET /auth/google/callback
   * Google redirects here with an authorization code.
   * We exchange it for tokens and create a Supabase session.
   */
  fastify.get('/google/callback', async (request, reply) => {
    const { clientId, clientSecret, redirectUrl, frontendUrl } = getConfig()
    const query = request.query as Record<string, string | undefined>

    // Handle error from Google
    if (query.error) {
      request.log.error({ error: query.error }, 'Google OAuth error')
      return reply.redirect(`${frontendUrl}/login?error=${query.error}`)
    }

    const code = query.code
    if (!code) {
      return reply.redirect(`${frontendUrl}/login?error=missing_code`)
    }

    try {
      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUrl,
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        request.log.error({ status: tokenResponse.status, error: errorText }, 'Failed to exchange code for tokens')
        return reply.redirect(`${frontendUrl}/login?error=token_exchange_failed`)
      }

      const tokens = await tokenResponse.json() as GoogleTokenResponse

      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })

      if (!userInfoResponse.ok) {
        request.log.error({ status: userInfoResponse.status }, 'Failed to get user info from Google')
        return reply.redirect(`${frontendUrl}/login?error=userinfo_failed`)
      }

      const googleUser = await userInfoResponse.json() as GoogleUserInfo

      if (!googleUser.verified_email) {
        return reply.redirect(`${frontendUrl}/login?error=email_not_verified`)
      }

      // Sign in or create user in Supabase using the Google ID token
      const supabase = getSupabase()
      
      const { data: authData, error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: tokens.id_token,
      })

      if (authError || !authData.session) {
        request.log.error({ error: authError }, 'Failed to sign in with Supabase')
        return reply.redirect(`${frontendUrl}/login?error=supabase_auth_failed`)
      }

      const { session, user } = authData

      // Determine if this is a new user (created within the last 60s)
      const createdAt = new Date(user.created_at)
      const isNewUser = Date.now() - createdAt.getTime() < 60_000

      // Establish session: provision user, set cookies, notify admins if new
      await establishSession(reply, request, {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: {
          id: user.id,
          email: user.email!,
          full_name: googleUser.name,
          avatar_url: googleUser.picture,
        },
        isNewUser,
      })

      request.log.info({ userId: user.id, email: user.email }, 'User signed in via Google')

      // Redirect to frontend
      return reply.redirect(`${frontendUrl}/`)
    } catch (err) {
      request.log.error({ error: err }, 'Google OAuth callback error')
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`)
    }
  })
}

export default googleAuthRoutes
