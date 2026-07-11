/**
 * Admin auth routes.
 * - POST /auth/admin/login   — authenticate an admin, set httpOnly cookies
 * - POST /auth/admin/register — super-admin creates a new admin account
 *
 * These are separate from user auth because admins live in their own table
 * and have a distinct role hierarchy.
 */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { formatResponse, formatError } from '../shared/supabase.js'
import { getSupabase } from '../shared/supabase.js'
import { authenticate } from '../shared/middleware/auth.js'
import { requireSuperAdmin } from '../shared/middleware/rbac.js'
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  sessionCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from './cookie.js'

// ── Input Schemas ─────────────────────────────────────────────────────────

const AdminLoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
}).strict()

const AdminRegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(120).trim(),
  role: z.enum(['admin', 'super_admin']).optional().default('admin'),
}).strict()

// ── Output Schemas ────────────────────────────────────────────────────────

const AdminLoginOutput = z.object({
  admin_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string(),
  role: z.enum(['admin', 'super_admin']),
})

const AdminRegisterOutput = z.object({
  admin_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string(),
  role: z.enum(['admin', 'super_admin']),
  created_by: z.string().uuid(),
})

// ── Routes ────────────────────────────────────────────────────────────────

const adminAuthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /auth/admin/login
   * Authenticate an admin by email/password.
   * Verifies the user exists in the admins table and is active.
   * On first login of the seeded super admin, links auth_user_id.
   */
  fastify.post('/admin/login', async (request, reply) => {
    const parsed = AdminLoginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email, password } = parsed.data
    const supabase = getSupabase()

    // Authenticate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.session) {
      return reply.code(401).send(formatError('Invalid email or password', 'INVALID_CREDENTIALS'))
    }

    const { session, user } = data

    // Verify this user is in the admins table
    let { data: admin, error: adminErr } = await supabase
      .from('admins')
      .select('*')
      .eq('email', email)
      .single()

    if (adminErr || !admin) {
      return reply.code(403).send(formatError('Not an admin account', 'NOT_ADMIN'))
    }

    if (!admin.is_active) {
      return reply.code(403).send(formatError('Admin account is deactivated', 'ADMIN_INACTIVE'))
    }

    // Link auth_user_id if this is first login (seeded admin without auth link)
    if (!admin.auth_user_id) {
      await supabase
        .from('admins')
        .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', admin.id)
    }

    // Update last_login
    await supabase
      .from('admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', admin.id)

    // Set the user's role in app_metadata so the middleware recognises it
    await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { role: admin.role },
    })

    // Set httpOnly cookies
    reply.setCookie(COOKIE_NAME, session.access_token, sessionCookieOptions())
    reply.setCookie(REFRESH_COOKIE_NAME, session.refresh_token, refreshCookieOptions())

    request.log.info({ adminId: admin.id, email, role: admin.role }, 'Admin logged in')

    const output = AdminLoginOutput.parse({
      admin_id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
    })
    return reply.send(formatResponse(output))
  })

  /**
   * POST /auth/admin/register
   * Only a super_admin can create new admin accounts.
   * Creates a Supabase Auth user + admins table row.
   */
  fastify.post('/admin/register', {
    onRequest: [authenticate, requireSuperAdmin],
  }, async (request, reply) => {
    const parsed = AdminRegisterSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
    }

    const { email, password, full_name, role } = parsed.data
    const supabase = getSupabase()
    const creatorId = request.user!.id

    // Find the creator's admin record
    const { data: creatorAdmin } = await supabase
      .from('admins')
      .select('id')
      .eq('auth_user_id', creatorId)
      .single()

    if (!creatorAdmin) {
      return reply.code(403).send(formatError('Creator admin record not found', 'FORBIDDEN'))
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name },
    })

    if (authError) {
      request.log.error({ error: authError }, 'Admin registration failed')
      const status = authError.message.includes('already registered') ? 409 : 400
      return reply.code(status).send(formatError(authError.message, 'AUTH_ERROR'))
    }

    const authUser = authData.user

    // Create admins table row
    const { data: newAdmin, error: insertErr } = await supabase
      .from('admins')
      .insert({
        auth_user_id: authUser.id,
        email,
        full_name,
        role,
        is_active: true,
        created_by: creatorAdmin.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr) {
      request.log.error({ error: insertErr }, 'Failed to create admin record')
      return reply.code(500).send(formatError('Failed to create admin record'))
    }

    request.log.info({ adminId: newAdmin.id, email, role, createdBy: creatorAdmin.id }, 'Admin created')

    const output = AdminRegisterOutput.parse({
      admin_id: newAdmin.id,
      email: newAdmin.email,
      full_name: newAdmin.full_name,
      role: newAdmin.role,
      created_by: creatorAdmin.id,
    })
    return reply.code(201).send(formatResponse(output))
  })

  /**
   * POST /auth/admin/logout
   * Clear admin session cookies.
   */
  fastify.post('/admin/logout', async (_request, reply) => {
    reply.setCookie(COOKIE_NAME, '', clearCookieOptions())
    reply.setCookie(REFRESH_COOKIE_NAME, '', { ...clearCookieOptions(), path: '/api/v1/auth' })

    return reply.send(formatResponse({ logged_out: true }))
  })
}

export default adminAuthRoutes
