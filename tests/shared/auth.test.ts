import { describe, it, expect } from 'vitest'
import { getUserRole, hasRole } from '../../src/shared/auth.js'
import type { AuthUser } from '../../src/shared/types.js'
import { UserRole } from '../../src/shared/types.js'

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user-123',
    email: 'test@example.com',
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    ...overrides,
  } as AuthUser
}

describe('getUserRole', () => {
  it('returns role from app_metadata when present', () => {
    const user = makeUser({ app_metadata: { role: UserRole.ADMIN } })
    expect(getUserRole(user)).toBe('admin')
  })

  it('falls back to user_metadata when app_metadata has no role', () => {
    const user = makeUser({
      app_metadata: {},
      user_metadata: { role: UserRole.SUPER_ADMIN },
    })
    expect(getUserRole(user)).toBe('super_admin')
  })

  it('defaults to "user" when no role is set', () => {
    const user = makeUser({ app_metadata: {}, user_metadata: {} })
    expect(getUserRole(user)).toBe('user')
  })

  it('prefers app_metadata over user_metadata', () => {
    const user = makeUser({
      app_metadata: { role: UserRole.SUPER_ADMIN },
      user_metadata: { role: UserRole.USER },
    })
    expect(getUserRole(user)).toBe('super_admin')
  })
})

describe('hasRole', () => {
  it('super_admin satisfies all roles', () => {
    const user = makeUser({ app_metadata: { role: UserRole.SUPER_ADMIN } })
    expect(hasRole(user, UserRole.USER)).toBe(true)
    expect(hasRole(user, UserRole.ADMIN)).toBe(true)
    expect(hasRole(user, UserRole.SUPER_ADMIN)).toBe(true)
  })

  it('admin satisfies admin and user but not super_admin', () => {
    const user = makeUser({ app_metadata: { role: UserRole.ADMIN } })
    expect(hasRole(user, UserRole.USER)).toBe(true)
    expect(hasRole(user, UserRole.ADMIN)).toBe(true)
    expect(hasRole(user, UserRole.SUPER_ADMIN)).toBe(false)
  })

  it('user only satisfies user role', () => {
    const user = makeUser({ app_metadata: { role: UserRole.USER } })
    expect(hasRole(user, UserRole.USER)).toBe(true)
    expect(hasRole(user, UserRole.ADMIN)).toBe(false)
    expect(hasRole(user, UserRole.SUPER_ADMIN)).toBe(false)
  })

  it('user with no explicit role defaults to user level', () => {
    const user = makeUser({})
    expect(hasRole(user, UserRole.USER)).toBe(true)
    expect(hasRole(user, UserRole.ADMIN)).toBe(false)
  })
})
