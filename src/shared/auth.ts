/**
 * Auth domain logic — token verification, role resolution, role checks.
 * Separated from supabase.ts to respect SRP: that module handles
 * only client initialisation and response formatting.
 */
import crypto from 'node:crypto'
import type { AuthUser, UserRole } from './types.js'
import { UserRole as Roles } from './types.js'
import { getSupabase } from './supabase.js'

/**
 * Verify a Supabase JWT locally using HMAC-SHA256.
 * This avoids a remote HTTP call to supabase.auth.getUser() on every request,
 * reducing auth latency from ~500-1000ms to <1ms.
 *
 * Falls back to remote verification if local decode fails (e.g. different signing algo).
 */
export async function verifyToken(token: string): Promise<AuthUser> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    // Fallback to remote if secret not configured
    return verifyTokenRemote(token)
  }

  try {
    const payload = verifyJwtLocal(token, secret)
    if (!payload || !payload.sub) {
      throw new Error('Invalid token payload')
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired')
    }

    // Construct AuthUser from JWT claims (same shape Supabase returns)
    return {
      id: payload.sub,
      email: payload.email,
      app_metadata: payload.app_metadata ?? {},
      user_metadata: payload.user_metadata ?? {},
      aud: payload.aud,
      role: payload.role,
    } as AuthUser
  } catch {
    // If local verification fails, fall back to remote
    return verifyTokenRemote(token)
  }
}

/**
 * Remote token verification via Supabase (fallback).
 */
async function verifyTokenRemote(token: string): Promise<AuthUser> {
  const supabase = getSupabase()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new Error('Invalid token')
  }

  return user as AuthUser
}

/**
 * Verify and decode a JWT using HMAC-SHA256 (HS256).
 * Supabase JWTs use HS256 signed with SUPABASE_JWT_SECRET.
 */
function verifyJwtLocal(token: string, secret: string): Record<string, any> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, signatureB64] = parts

  // Verify signature
  const data = `${headerB64}.${payloadB64}`
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url')

  if (expectedSig !== signatureB64) return null

  // Decode payload
  try {
    const decoded = Buffer.from(payloadB64, 'base64url').toString('utf8')
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Resolve the effective role for a user.
 * Priority: app_metadata (admin-set) > user_metadata (self-reported) > default 'user'.
 */
export function getUserRole(user: AuthUser): UserRole {
  if (user.app_metadata?.role) {
    return user.app_metadata.role as UserRole
  }
  if (user.user_metadata?.role) {
    return user.user_metadata.role as UserRole
  }
  return 'user' as UserRole
}

/**
 * Role hierarchy: super_admin > admin > user.
 */
const ROLE_LEVEL: Record<string, number> = {
  [Roles.SUPER_ADMIN]: 2,
  [Roles.ADMIN]: 1,
  [Roles.USER]: 0,
}

/**
 * Check if a user satisfies a required role.
 * Higher roles implicitly satisfy lower requirements.
 */
export function hasRole(user: AuthUser, requiredRole: UserRole): boolean {
  const userRole = getUserRole(user)
  return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[requiredRole] ?? 0)
}
