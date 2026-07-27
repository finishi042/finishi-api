/**
 * Middleware tests — authenticate, requireUser, requireAdmin, requireSuperAdmin, requirePlan.
 * Tests the middleware functions in isolation with mock request/reply objects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserRole } from '../../src/shared/types.js'
import type { AuthUser } from '../../src/shared/types.js'

// Mock verifyToken
const mockVerifyToken = vi.fn()
vi.mock('../../src/shared/auth.js', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
  }
})

// Mock getSubscriptionService for require-plan
const mockHasAccess = vi.fn()
vi.mock('../../src/billing/provider.js', () => ({
  getSubscriptionService: () => ({
    hasAccess: mockHasAccess,
  }),
}))

const { authenticate } = await import('../../src/shared/middleware/auth.js')
const { requireUser, requireAdmin, requireSuperAdmin, requireRole: _requireRole } = await import('../../src/shared/middleware/rbac.js')
const { requirePlan } = await import('../../src/shared/middleware/require-plan.js')

// ── Request/Reply factories ───────────────────────────────────────────────────

function makeRequest(overrides: any = {}) {
  return {
    cookies: {},
    headers: {},
    user: undefined,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    ...overrides,
  } as any
}

function makeReply() {
  const reply: any = {
    _statusCode: null,
    _body: null,
    code: vi.fn().mockImplementation(function (this: any, c: number) { this._statusCode = c; return this }),
    send: vi.fn().mockImplementation(function (this: any, b: any) { this._body = b; return this }),
  }
  return reply
}

function fakeUser(role: UserRole = UserRole.USER): AuthUser {
  return {
    id: 'user-123',
    email: 'test@test.com',
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
    app_metadata: { role },
    user_metadata: { full_name: 'Test' },
  } as AuthUser
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no token is present', async () => {
    const request = makeRequest({ cookies: {}, headers: {} })
    const reply = makeReply()

    await authenticate(request, reply)

    expect(reply._statusCode).toBe(401)
    expect(reply._body.error.code).toBe('UNAUTHORIZED')
  })

  it('reads token from finishi_session cookie', async () => {
    const user = fakeUser()
    mockVerifyToken.mockResolvedValueOnce(user)

    const request = makeRequest({ cookies: { finishi_session: 'valid_token' } })
    const reply = makeReply()

    await authenticate(request, reply)

    expect(mockVerifyToken).toHaveBeenCalledWith('valid_token')
    expect(request.user).toBe(user)
    expect(reply._statusCode).toBeNull() // no error response sent
  })

  it('falls back to Authorization Bearer header', async () => {
    const user = fakeUser()
    mockVerifyToken.mockResolvedValueOnce(user)

    const request = makeRequest({
      cookies: {},
      headers: { authorization: 'Bearer header_token' },
    })
    const reply = makeReply()

    await authenticate(request, reply)

    expect(mockVerifyToken).toHaveBeenCalledWith('header_token')
    expect(request.user).toBe(user)
  })

  it('prefers cookie over header', async () => {
    const user = fakeUser()
    mockVerifyToken.mockResolvedValueOnce(user)

    const request = makeRequest({
      cookies: { finishi_session: 'cookie_token' },
      headers: { authorization: 'Bearer header_token' },
    })
    const reply = makeReply()

    await authenticate(request, reply)

    expect(mockVerifyToken).toHaveBeenCalledWith('cookie_token')
  })

  it('returns 401 when verifyToken throws', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Token expired'))

    const request = makeRequest({ cookies: { finishi_session: 'expired_token' } })
    const reply = makeReply()

    await authenticate(request, reply)

    expect(reply._statusCode).toBe(401)
    expect(reply._body.error.message).toContain('Invalid or expired')
  })
})

describe('RBAC middleware', () => {
  describe('requireUser', () => {
    it('passes for a user with USER role', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.USER) })
      const reply = makeReply()

      await requireUser(request, reply)

      expect(reply._statusCode).toBeNull()
    })

    it('passes for admin (higher role)', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.ADMIN) })
      const reply = makeReply()

      await requireUser(request, reply)

      expect(reply._statusCode).toBeNull()
    })

    it('returns 401 when request.user is null', async () => {
      const request = makeRequest({ user: null })
      const reply = makeReply()

      await requireUser(request, reply)

      expect(reply._statusCode).toBe(401)
    })
  })

  describe('requireAdmin', () => {
    it('passes for admin role', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.ADMIN) })
      const reply = makeReply()

      await requireAdmin(request, reply)

      expect(reply._statusCode).toBeNull()
    })

    it('returns 403 for regular user', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.USER) })
      const reply = makeReply()

      await requireAdmin(request, reply)

      expect(reply._statusCode).toBe(403)
      expect(reply._body.error.code).toBe('FORBIDDEN')
    })

    it('passes for super_admin', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.SUPER_ADMIN) })
      const reply = makeReply()

      await requireAdmin(request, reply)

      expect(reply._statusCode).toBeNull()
    })
  })

  describe('requireSuperAdmin', () => {
    it('passes for super_admin', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.SUPER_ADMIN) })
      const reply = makeReply()

      await requireSuperAdmin(request, reply)

      expect(reply._statusCode).toBeNull()
    })

    it('returns 403 for admin (lower role)', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.ADMIN) })
      const reply = makeReply()

      await requireSuperAdmin(request, reply)

      expect(reply._statusCode).toBe(403)
    })

    it('returns 403 for regular user', async () => {
      const request = makeRequest({ user: fakeUser(UserRole.USER) })
      const reply = makeReply()

      await requireSuperAdmin(request, reply)

      expect(reply._statusCode).toBe(403)
    })
  })
})

describe('requirePlan middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not set', async () => {
    const request = makeRequest({ user: null })
    const reply = makeReply()

    const middleware = requirePlan('pro')
    await middleware(request, reply)

    expect(reply._statusCode).toBe(401)
  })

  it('passes when user has sufficient plan access', async () => {
    mockHasAccess.mockResolvedValueOnce(true)

    const request = makeRequest({ user: fakeUser() })
    const reply = makeReply()

    const middleware = requirePlan('pro')
    await middleware(request, reply)

    expect(reply._statusCode).toBeNull()
    expect(mockHasAccess).toHaveBeenCalledWith('user-123', 'pro')
  })

  it('returns 403 with PLAN_REQUIRED when user lacks access', async () => {
    mockHasAccess.mockResolvedValueOnce(false)

    const request = makeRequest({ user: fakeUser() })
    const reply = makeReply()

    const middleware = requirePlan('enterprise')
    await middleware(request, reply)

    expect(reply._statusCode).toBe(403)
    expect(reply._body.error.code).toBe('PLAN_REQUIRED')
    expect(reply._body.error.message).toContain('enterprise')
  })
})
