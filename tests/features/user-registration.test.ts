/**
 * Feature Test: User Registration Flow
 *
 * Tests the complete user registration flow from signup through onboarding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp as _buildApp, fakeUser as _fakeUser, createMockSupabaseChain as _createMockSupabaseChain } from '../helpers/build-app.js'

// Mock dependencies
vi.mock('../../src/auth/onboarding.js', () => ({
  provisionUser: vi.fn().mockResolvedValue({ id: 'user_1' }),
}))

vi.mock('../../src/admin/notifications/emitter.js', () => ({
  notifyAdminUserSignup: vi.fn(),
}))

vi.mock('../../src/auth/cookie.js', () => ({
  COOKIE_NAME: 'finishi_session',
  REFRESH_COOKIE_NAME: 'finishi_refresh',
  sessionCookieOptions: () => ({ httpOnly: true, path: '/' }),
  refreshCookieOptions: () => ({ httpOnly: true, path: '/api/v1/auth' }),
  clearCookieOptions: () => ({ httpOnly: true, path: '/', maxAge: 0 }),
}))

describe('Feature: User Registration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('New User Signup', () => {
    it('should create session cookies on successful signup', async () => {
      const { establishSession } = await import('../../src/auth/session.js')
      const reply = { setCookie: vi.fn() } as any
      const request = { log: { error: vi.fn(), info: vi.fn() } } as any

      await establishSession(reply, request, {
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        user: { id: 'new_user', email: 'new@example.com', full_name: 'New User' },
        isNewUser: true,
      })

      expect(reply.setCookie).toHaveBeenCalledWith(
        'finishi_session',
        'new_access_token',
        expect.any(Object)
      )
      expect(reply.setCookie).toHaveBeenCalledWith(
        'finishi_refresh',
        'new_refresh_token',
        expect.any(Object)
      )
    })

    it('should notify admins when a new user signs up', async () => {
      const { establishSession } = await import('../../src/auth/session.js')
      const { notifyAdminUserSignup } = await import('../../src/admin/notifications/emitter.js')

      const reply = { setCookie: vi.fn() } as any
      const request = { log: { error: vi.fn(), info: vi.fn() } } as any

      await establishSession(reply, request, {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 'user_123', email: 'notify@example.com', full_name: 'Notify User' },
        isNewUser: true,
      })

      expect(notifyAdminUserSignup).toHaveBeenCalledWith(
        'user_123',
        'notify@example.com',
        'Notify User'
      )
    })

    it('should provision user data on signup', async () => {
      const { establishSession } = await import('../../src/auth/session.js')
      const { provisionUser } = await import('../../src/auth/onboarding.js')

      const reply = { setCookie: vi.fn() } as any
      const request = { log: { error: vi.fn(), info: vi.fn() } } as any

      await establishSession(reply, request, {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 'provision_user', email: 'provision@example.com', full_name: 'Provision User' },
      })

      expect(provisionUser).toHaveBeenCalledWith({
        id: 'provision_user',
        email: 'provision@example.com',
        full_name: 'Provision User',
      })
    })
  })

  describe('Returning User Login', () => {
    it('should not notify admins for returning users', async () => {
      const { establishSession } = await import('../../src/auth/session.js')
      const { notifyAdminUserSignup } = await import('../../src/admin/notifications/emitter.js')

      const reply = { setCookie: vi.fn() } as any
      const request = { log: { error: vi.fn(), info: vi.fn() } } as any

      await establishSession(reply, request, {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 'returning_user', email: 'returning@example.com' },
        isNewUser: false,
      })

      expect(notifyAdminUserSignup).not.toHaveBeenCalled()
    })

    it('should still provision user for returning users', async () => {
      const { establishSession } = await import('../../src/auth/session.js')
      const { provisionUser } = await import('../../src/auth/onboarding.js')

      const reply = { setCookie: vi.fn() } as any
      const request = { log: { error: vi.fn(), info: vi.fn() } } as any

      await establishSession(reply, request, {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 'returning_user', email: 'returning@example.com' },
        isNewUser: false,
      })

      expect(provisionUser).toHaveBeenCalled()
    })
  })

  describe('Session Management', () => {
    it('should clear both cookies on logout', async () => {
      const { clearSession } = await import('../../src/auth/session.js')
      const reply = { setCookie: vi.fn() } as any

      clearSession(reply)

      expect(reply.setCookie).toHaveBeenCalledTimes(2)
      expect(reply.setCookie).toHaveBeenCalledWith(
        'finishi_session',
        '',
        expect.objectContaining({ maxAge: 0 })
      )
      expect(reply.setCookie).toHaveBeenCalledWith(
        'finishi_refresh',
        '',
        expect.objectContaining({ maxAge: 0 })
      )
    })
  })
})
