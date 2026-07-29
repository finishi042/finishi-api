/**
 * Route integration tests for auth endpoints.
 * Uses Fastify inject() with mocked Supabase to test full HTTP lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import { fakeUser } from '../helpers/build-app.js'
import { clearAll } from '../../src/auth/rate-limiter.js'

// ── Create persistent mock objects ───────────────────────────────────────────

const mockAuth = {
  getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } }),
  signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'Invalid' } }),
  refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'Invalid' } }),
  admin: {
    createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Failed' } }),
  },
}

const mockChain = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null }),
}

const mockSupabase = { from: vi.fn(() => mockChain), auth: mockAuth }

// Mock all modules that auth routes depend on
vi.mock('../../src/shared/supabase.js', () => ({
  getSupabase: () => mockSupabase,
  initSupabase: () => mockSupabase,
  formatResponse: (data: any, success = true) => ({ success, data }),
  formatError: (message: string, code?: string) => ({ success: false, error: { message, code } }),
}))

vi.mock('../../src/auth/onboarding.js', () => ({
  provisionUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
}))

vi.mock('../../src/admin/notifications/emitter.js', () => ({
  notifyAdminUserSignup: vi.fn(),
}))

vi.mock('../../src/auth/cookie.js', () => ({
  COOKIE_NAME: 'finishi_session',
  REFRESH_COOKIE_NAME: 'finishi_refresh',
  sessionCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 3600 }),
  refreshCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: 'lax', path: '/api/v1/auth', maxAge: 2592000 }),
  clearCookieOptions: () => ({ httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 0 }),
}))

// Mock the session helper so establishSession doesn't try real DB provisioning
vi.mock('../../src/auth/session.js', () => ({
  establishSession: vi.fn().mockImplementation(async (reply: any, _request: any, params: any) => {
    // Set cookies just like the real implementation
    reply.setCookie('finishi_session', params.accessToken, { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 3600 })
    reply.setCookie('finishi_refresh', params.refreshToken, { httpOnly: true, secure: false, sameSite: 'lax', path: '/api/v1/auth', maxAge: 2592000 })
  }),
  clearSession: vi.fn().mockImplementation((reply: any) => {
    reply.setCookie('finishi_session', '', { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 0 })
    reply.setCookie('finishi_refresh', '', { httpOnly: true, secure: false, sameSite: 'lax', path: '/api/v1/auth', maxAge: 0 })
  }),
}))

const { default: authRoutes } = await import('../../src/auth/routes.js')

async function buildAuthApp() {
  const app = Fastify({ logger: false })
  await app.register(fastifyCookie)
  app.decorateRequest('user', null)
  await app.register(authRoutes, { prefix: '/api/v1/auth' })
  await app.ready()
  return app
}

describe('Auth Routes', () => {
  let app: Awaited<ReturnType<typeof buildAuthApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearAll()
    app = await buildAuthApp()
  })

  describe('POST /api/v1/auth/signup', () => {
    it('returns 400 for missing email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { password: 'validpass123' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for invalid email format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email: 'not-an-email', password: 'validpass123' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 for short password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email: 'test@test.com', password: 'short' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.message).toContain('8 characters')
    })

    it('returns 400 for extra fields (strict mode)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email: 'test@test.com', password: 'validpass123', hackerField: 'bad' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 409 when email already registered', async () => {
      mockAuth.admin.createUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'User already registered' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email: 'existing@test.com', password: 'ValidPass123!' },
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('AUTH_ERROR')
    })

    it('returns 201 on successful signup', async () => {
      const user = fakeUser()
      mockAuth.admin.createUser.mockResolvedValueOnce({
        data: { user: { id: user.id, email: user.email } },
        error: null,
      })
      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: {
          session: { access_token: 'at_123', refresh_token: 'rt_456' },
          user: { id: user.id, email: user.email, user_metadata: { full_name: 'Test User' } },
        },
        error: null,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup',
        payload: { email: user.email, password: 'ValidPass123!', full_name: 'Test User' },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().success).toBe(true)
      const cookies = res.cookies
      expect(cookies.some((c: any) => c.name === 'finishi_session')).toBe(true)
      expect(cookies.some((c: any) => c.name === 'finishi_refresh')).toBe(true)
    })
  })

  describe('POST /api/v1/auth/login', () => {
    it('returns 400 for missing credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 401 for invalid credentials', async () => {
      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Invalid login credentials' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@test.com', password: 'wrongpassword' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 200 with cookies on successful login', async () => {
      const user = fakeUser()
      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: {
          session: { access_token: 'at_login', refresh_token: 'rt_login' },
          user: { id: user.id, email: user.email, user_metadata: { full_name: 'Test', avatar_url: null } },
        },
        error: null,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'test@test.com', password: 'correctpass' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      expect(res.json().data.user_id).toBe(user.id)

      const sessionCookie = res.cookies.find((c: any) => c.name === 'finishi_session')
      expect(sessionCookie).toBeDefined()
      expect(sessionCookie!.httpOnly).toBe(true)
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('clears cookies and returns success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.logged_out).toBe(true)

      const sessionCookie = res.cookies.find((c: any) => c.name === 'finishi_session')
      expect(sessionCookie).toBeDefined()
      expect(sessionCookie!.maxAge).toBe(0)
    })
  })

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 401 when no refresh cookie present', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('NO_REFRESH_TOKEN')
    })

    it('returns 401 when refresh token is invalid', async () => {
      mockAuth.refreshSession.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Token expired' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { finishi_refresh: 'expired_token' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('REFRESH_FAILED')
    })

    it('returns 200 with new cookies on successful refresh', async () => {
      mockAuth.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: 'new_at', refresh_token: 'new_rt' } },
        error: null,
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { finishi_refresh: 'valid_refresh_token' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.refreshed).toBe(true)
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 when no token is present', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 401 for invalid token', async () => {
      mockAuth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { finishi_session: 'bad_token' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns user data for valid session cookie', async () => {
      const user = fakeUser()
      mockAuth.getUser.mockResolvedValueOnce({
        data: { user: { id: user.id, email: user.email, user_metadata: { full_name: 'Test' } } },
        error: null,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { finishi_session: 'valid_token' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.user_id).toBe(user.id)
    })

    it('supports Authorization Bearer header', async () => {
      const user = fakeUser()
      mockAuth.getUser.mockResolvedValueOnce({
        data: { user: { id: user.id, email: user.email, user_metadata: { full_name: 'Test' } } },
        error: null,
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer valid_token_here' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.user_id).toBe(user.id)
    })
  })
})
