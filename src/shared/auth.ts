/**
 * Auth domain logic — token verification, role resolution, role checks.
 * Separated from supabase.ts to respect SRP: that module handles
 * only client initialisation and response formatting.
 */
import type { AuthUser, UserRole } from './types.js'
import { UserRole as Roles } from './types.js'
import { getSupabase } from './supabase.js'

/**
 * Verify a Supabase JWT and return the authenticated user.
 */
export async function verifyToken(token: string): Promise<AuthUser> {
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
