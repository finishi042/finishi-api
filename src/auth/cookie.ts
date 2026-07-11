/**
 * Cookie configuration for auth tokens.
 * httpOnly + Secure + SameSite=Lax protects against XSS and CSRF.
 *
 * Why not localStorage?
 * - localStorage is accessible to ANY JavaScript on the page (XSS vulnerable)
 * - httpOnly cookies cannot be read by JS at all — only sent by the browser automatically
 * - This means a successful XSS attack cannot steal the session token
 */
import type { CookieSerializeOptions } from '@fastify/cookie'

export const COOKIE_NAME = 'finishi_session'
export const REFRESH_COOKIE_NAME = 'finishi_refresh'

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function sessionCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour (matches Supabase access token TTL)
  }
}

export function refreshCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/api/v1/auth', // only sent to auth endpoints
    maxAge: 60 * 60 * 24 * 30, // 30 days
  }
}

export function clearCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}
