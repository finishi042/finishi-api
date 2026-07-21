/**
 * Test app builder — creates a Fastify instance with mocked Supabase for inject() testing.
 *
 * Usage:
 *   const { app, mockSupabase } = await buildApp()
 *   const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })
 *
 * Authentication in tests:
 *   Set the cookie or Authorization header. The auth middleware calls verifyToken
 *   which is mocked to return a fake user when a valid-looking token is provided.
 */
import { vi } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import type { AuthUser } from '../../src/shared/types.js'
import { UserRole } from '../../src/shared/types.js'

// ── Mock Supabase chain builder ───────────────────────────────────────────────

export interface MockSupabaseChain {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
}

export function createMockSupabaseChain(resolveData: any = null): MockSupabaseChain {
  const chain: MockSupabaseChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolveData, error: null }),
  }
  // Allow chain methods to return `this` for any order of calls
  for (const key of Object.keys(chain) as (keyof MockSupabaseChain)[]) {
    if (key !== 'single') {
      ;(chain[key] as any).mockReturnValue(chain)
    }
  }
  return chain
}

export function createMockSupabase() {
  const chain = createMockSupabaseChain()
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Invalid token' } }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'Invalid' } }),
    refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: { message: 'Invalid' } }),
    admin: {
      createUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'Failed' } }),
      updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  }

  const supabase = {
    from: vi.fn(() => chain),
    auth,
    _chain: chain,
  }
  return supabase
}

// ── Fake users ────────────────────────────────────────────────────────────────

export function fakeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'testuser@finishi.app',
    aud: 'authenticated',
    created_at: '2024-01-01T00:00:00Z',
    app_metadata: { role: UserRole.USER },
    user_metadata: { full_name: 'Test User' },
    ...overrides,
  } as AuthUser
}

export function fakeAdmin(overrides: Partial<AuthUser> = {}): AuthUser {
  return fakeUser({
    id: '00000000-0000-4000-a000-000000000002',
    email: 'admin@finishi.app',
    app_metadata: { role: UserRole.ADMIN },
    user_metadata: { full_name: 'Admin User' },
    ...overrides,
  })
}

export function fakeSuperAdmin(overrides: Partial<AuthUser> = {}): AuthUser {
  return fakeUser({
    id: '00000000-0000-4000-a000-000000000003',
    email: 'super@finishi.app',
    app_metadata: { role: UserRole.SUPER_ADMIN },
    user_metadata: { full_name: 'Super Admin' },
    ...overrides,
  })
}

// ── App builder ───────────────────────────────────────────────────────────────

export interface BuildAppOptions {
  /** Mock user returned by verifyToken. Set to null to simulate unauthenticated state. */
  user?: AuthUser | null
}

/**
 * Build a lightweight Fastify instance with mocked Supabase suitable for inject() tests.
 * Auth middleware is replaced with a simplified version that uses the provided mock user.
 */
export async function buildApp(opts: BuildAppOptions = {}) {
  const mockSupabase = createMockSupabase()
  const user = opts.user !== undefined ? opts.user : fakeUser()

  const app = Fastify({ logger: false })
  await app.register(fastifyCookie)

  // Decorate request with supabase and user (mimics plugins)
  app.decorateRequest('supabase', null)
  app.decorateRequest('user', null)

  app.addHook('onRequest', async (request) => {
    ;(request as any).supabase = mockSupabase
  })

  return { app, mockSupabase, user }
}

/**
 * Build an app with auth routes registered for testing.
 */
export async function buildAuthApp(opts: BuildAppOptions = {}) {
  const { app, mockSupabase, user } = await buildApp(opts)

  // Register auth routes with mocked supabase
  // We mock the shared module so verifyToken returns our fake user
  const { default: authRoutes } = await import('../../src/auth/routes.js')
  await app.register(authRoutes, { prefix: '/api/v1/auth' })

  await app.ready()
  return { app, mockSupabase, user }
}

/**
 * Build an app with billing routes registered for testing.
 * The authenticate middleware is replaced with a simple user injection.
 */
export async function buildBillingApp(opts: BuildAppOptions = {}) {
  const { app, mockSupabase, user } = await buildApp(opts)

  // Inject user on every request (simulates successful authentication)
  if (user) {
    app.addHook('onRequest', async (request) => {
      ;(request as any).user = user
    })
  }

  const { default: billingRoutes } = await import('../../src/billing/routes.js')
  await app.register(billingRoutes, { prefix: '/api/v1/user' })

  await app.ready()
  return { app, mockSupabase, user }
}
