import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module under test
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

const { establishSession, clearSession } = await import('../../src/auth/session.js')
const { provisionUser } = await import('../../src/auth/onboarding.js')
const { notifyAdminUserSignup } = await import('../../src/admin/notifications/emitter.js')

function makeReply() {
  return {
    setCookie: vi.fn(),
  } as any
}

function makeRequest() {
  return {
    log: { error: vi.fn(), info: vi.fn() },
  } as any
}

describe('establishSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provisions the user', async () => {
    const reply = makeReply()
    const request = makeRequest()

    await establishSession(reply, request, {
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      user: { id: 'user_1', email: 'test@test.com', full_name: 'Test User' },
    })

    expect(provisionUser).toHaveBeenCalledWith({
      id: 'user_1',
      email: 'test@test.com',
      full_name: 'Test User',
    })
  })

  it('sets session and refresh cookies', async () => {
    const reply = makeReply()
    const request = makeRequest()

    await establishSession(reply, request, {
      accessToken: 'access_token_value',
      refreshToken: 'refresh_token_value',
      user: { id: 'user_1', email: 'test@test.com' },
    })

    expect(reply.setCookie).toHaveBeenCalledWith(
      'finishi_session',
      'access_token_value',
      expect.objectContaining({ httpOnly: true })
    )
    expect(reply.setCookie).toHaveBeenCalledWith(
      'finishi_refresh',
      'refresh_token_value',
      expect.objectContaining({ httpOnly: true })
    )
  })

  it('notifies admins when isNewUser is true', async () => {
    const reply = makeReply()
    const request = makeRequest()

    await establishSession(reply, request, {
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      user: { id: 'user_1', email: 'new@test.com', full_name: 'New User' },
      isNewUser: true,
    })

    expect(notifyAdminUserSignup).toHaveBeenCalledWith('user_1', 'new@test.com', 'New User')
  })

  it('does NOT notify admins when isNewUser is false', async () => {
    const reply = makeReply()
    const request = makeRequest()

    await establishSession(reply, request, {
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      user: { id: 'user_1', email: 'existing@test.com' },
      isNewUser: false,
    })

    expect(notifyAdminUserSignup).not.toHaveBeenCalled()
  })

  it('does NOT notify admins when isNewUser is undefined', async () => {
    const reply = makeReply()
    const request = makeRequest()

    await establishSession(reply, request, {
      accessToken: 'access_123',
      refreshToken: 'refresh_456',
      user: { id: 'user_1', email: 'test@test.com' },
    })

    expect(notifyAdminUserSignup).not.toHaveBeenCalled()
  })

  it('logs error but does not throw when provisionUser fails', async () => {
    const reply = makeReply()
    const request = makeRequest()

    ;(provisionUser as any).mockRejectedValueOnce(new Error('DB down'))

    await expect(
      establishSession(reply, request, {
        accessToken: 'access_123',
        refreshToken: 'refresh_456',
        user: { id: 'user_1', email: 'test@test.com' },
      })
    ).resolves.toBeUndefined()

    expect(request.log.error).toHaveBeenCalled()
    // Cookies should still be set even if provisioning fails
    expect(reply.setCookie).toHaveBeenCalledTimes(2)
  })
})

describe('clearSession', () => {
  it('clears both session and refresh cookies', () => {
    const reply = makeReply()

    clearSession(reply)

    expect(reply.setCookie).toHaveBeenCalledWith(
      'finishi_session',
      '',
      expect.objectContaining({ maxAge: 0 })
    )
    expect(reply.setCookie).toHaveBeenCalledWith(
      'finishi_refresh',
      '',
      expect.objectContaining({ maxAge: 0, path: '/api/v1/auth' })
    )
  })

  it('sets exactly 2 cookies', () => {
    const reply = makeReply()
    clearSession(reply)
    expect(reply.setCookie).toHaveBeenCalledTimes(2)
  })
})
