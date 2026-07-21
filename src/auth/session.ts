/**
 * Auth session helper — centralises the repeated pattern of:
 *   1. Provisioning a user (no-op if exists)
 *   2. Setting httpOnly session + refresh cookies
 *   3. Notifying admins of new signups
 *
 * Single Responsibility: session establishment after successful authentication.
 * Used by signup, login, and Google OAuth flows.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { provisionUser, type ProvisionUserParams } from './onboarding.js'
import { notifyAdminUserSignup } from '../admin/notifications/emitter.js'
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  sessionCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from './cookie.js'

export interface EstablishSessionParams {
  /** The Supabase access token */
  accessToken: string
  /** The Supabase refresh token */
  refreshToken: string
  /** User provisioning data */
  user: ProvisionUserParams
  /** Whether this is a brand-new user (triggers admin notification) */
  isNewUser?: boolean
}

/**
 * Establish a session for the authenticated user.
 * Provisions application-level rows, sets httpOnly cookies, and notifies admins if new.
 */
export async function establishSession(
  reply: FastifyReply,
  request: FastifyRequest,
  params: EstablishSessionParams
): Promise<void> {
  // Provision user rows (no-op if they already exist)
  try {
    await provisionUser(params.user)
  } catch (err) {
    request.log.error({ err, userId: params.user.id }, 'Failed to provision user during session setup')
  }

  // Set httpOnly session cookies
  reply.setCookie(COOKIE_NAME, params.accessToken, sessionCookieOptions())
  reply.setCookie(REFRESH_COOKIE_NAME, params.refreshToken, refreshCookieOptions())

  // Notify admins of new signups
  if (params.isNewUser) {
    notifyAdminUserSignup(
      params.user.id,
      params.user.email,
      params.user.full_name
    )
  }
}

/**
 * Clear all session cookies (logout helper).
 * Used by both user and admin logout routes to avoid duplicated cookie-clearing logic.
 */
export function clearSession(reply: FastifyReply): void {
  reply.setCookie(COOKIE_NAME, '', clearCookieOptions())
  reply.setCookie(REFRESH_COOKIE_NAME, '', { ...clearCookieOptions(), path: '/api/v1/auth' })
}
