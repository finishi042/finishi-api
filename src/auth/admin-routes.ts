/**
 * Admin auth routes.
 * - POST /auth/admin/login   — authenticate an admin, set httpOnly cookies
 * - POST /auth/admin/register — super-admin creates a new admin account
 * - POST /auth/admin/forgot-password — send OTP for password reset
 * - POST /auth/admin/reset-password — reset password with OTP
 *
 * These are separate from user auth because admins live in their own table
 * and have a distinct role hierarchy.
 */
import crypto from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { formatResponse, formatError } from '../shared/supabase.js'
import { getSupabase } from '../shared/supabase.js'
import { authenticate } from '../shared/middleware/auth.js'
import { requireSuperAdmin } from '../shared/middleware/rbac.js'
import { passwordSchema } from './schemas.js'
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  sessionCookieOptions,
  refreshCookieOptions,
  clearCookieOptions,
} from './cookie.js'

// OTP hashing utilities
function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex')
}

function verifyOtp(otp: string, hash: string): boolean {
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(otpHash), Buffer.from(hash))
}

// ── Input Schemas ─────────────────────────────────────────────────────────

const AdminLoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
}).strict()

const AdminRegisterSchema = z.object({
  email: z.string().email().max(254),
  password: passwordSchema,
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
   * Stricter rate limit: 5 requests per 15 minutes per IP
   */
  fastify.post('/admin/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: (request: any) => request.ip,
      },
    },
  }, async (request, reply) => {
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
    const { data: admin, error: adminErr } = await supabase
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

/**
 * POST /auth/admin/forgot-password
 * Send a 6-digit OTP to the admin's email.
 * Stricter rate limit: 3 requests per 15 minutes per IP
 */
fastify.post('/admin/forgot-password', {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '15 minutes',
      keyGenerator: (request: any) => request.ip,
    },
  },
}, async (request, reply) => {
  const parsed = z.object({ email: z.string().email().max(254) }).safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
  }

  const { email } = parsed.data
  const supabase = getSupabase()

  // Verify this email belongs to an active admin
  const { data: admin } = await supabase
    .from('admins')
    .select('id, is_active')
    .eq('email', email)
    .single()

  if (!admin) {
    return reply.code(404).send(formatError('No admin account found with this email address.', 'ADMIN_NOT_FOUND'))
  }

  if (!admin.is_active) {
    return reply.code(403).send(formatError('This admin account has been deactivated.', 'ADMIN_INACTIVE'))
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  // Store OTP
  await supabase.from('password_reset_otps').upsert({
    email,
    otp_hash: hashOtp(otp),
    expires_at: expiresAt.toISOString(),
    attempts: 0,
    used: false,
    created_at: new Date().toISOString(),
  }, { onConflict: 'email' })

  // Send OTP email
  try {
    const { Resend } = await import('resend')
    const { otpTemplate } = await import('../admin/email/templates.js')
    const resend = new Resend(fastify.config.RESEND_API_KEY)
    
    const { subject, html } = otpTemplate({ otp, isAdmin: true })
    
    await resend.emails.send({
      from: fastify.config.EMAIL_FROM,
      to: email,
      subject,
      html,
    })
    request.log.info({ email }, 'Admin password reset OTP sent')
  } catch (err) {
    request.log.error({ err, email }, 'Failed to send admin OTP email')
  }

  return reply.send(formatResponse({
    message: 'A verification code has been sent to your email.',
  }))
})

/**
 * POST /auth/admin/reset-password
 * Reset admin password using OTP verification.
 */
fastify.post('/admin/reset-password', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '15 minutes',
      keyGenerator: (request: any) => request.ip,
    },
  },
}, async (request, reply) => {
  const parsed = z.object({
    email: z.string().email().max(254),
    otp: z.string().length(6).regex(/^\d{6}$/),
    password: passwordSchema,
  }).safeParse(request.body)
  
  if (!parsed.success) {
    return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
  }

  const { email, otp, password } = parsed.data
  const supabase = getSupabase()

  // Get OTP record
  const { data: otpRecord } = await supabase
    .from('password_reset_otps')
    .select('*')
    .eq('email', email)
    .single()

  if (!otpRecord) {
    return reply.code(400).send(formatError('No password reset request found.', 'OTP_NOT_FOUND'))
  }

  if (otpRecord.used) {
    return reply.code(400).send(formatError('This code has already been used.', 'OTP_USED'))
  }

  if (new Date(otpRecord.expires_at) < new Date()) {
    return reply.code(400).send(formatError('This code has expired.', 'OTP_EXPIRED'))
  }

  if (otpRecord.attempts >= 5) {
    return reply.code(400).send(formatError('Too many failed attempts.', 'OTP_LOCKED'))
  }

  // Verify OTP
  if (!verifyOtp(otp, otpRecord.otp_hash)) {
    await supabase
      .from('password_reset_otps')
      .update({ attempts: otpRecord.attempts + 1 })
      .eq('email', email)

    return reply.code(400).send(formatError('Invalid code.', 'OTP_INVALID'))
  }

  // Get admin record
  const { data: admin } = await supabase
    .from('admins')
    .select('id, auth_user_id')
    .eq('email', email)
    .single()

  if (!admin || !admin.auth_user_id) {
    return reply.code(400).send(formatError('Admin not found.', 'ADMIN_NOT_FOUND'))
  }

  // Update password
  const { error: updateError } = await supabase.auth.admin.updateUserById(admin.auth_user_id, {
    password,
  })

  if (updateError) {
    request.log.error({ error: updateError }, 'Admin password reset failed')
    return reply.code(500).send(formatError('Failed to reset password.'))
  }

  // Mark OTP as used
  await supabase
    .from('password_reset_otps')
    .update({ used: true })
    .eq('email', email)

  request.log.info({ adminId: admin.id, email }, 'Admin password reset successful via OTP')

  return reply.send(formatResponse({
    message: 'Password has been reset successfully. Please log in with your new password.',
  }))
})

/**
 * POST /auth/admin/update-password
 * Update password for an authenticated admin (requires current password).
 */
fastify.post('/admin/update-password', {
  onRequest: [authenticate],
}, async (request, reply) => {
  const parsed = z.object({
    current_password: z.string().min(1).max(128),
    new_password: passwordSchema,
  }).safeParse(request.body)

  if (!parsed.success) {
    return reply.code(400).send(formatError(parsed.error.issues[0].message, 'VALIDATION_ERROR'))
  }

  const { current_password, new_password } = parsed.data
  const supabase = getSupabase()

  // Get the admin record
  const { data: admin } = await supabase
    .from('admins')
    .select('id, email')
    .eq('auth_user_id', request.user!.id)
    .single()

  if (!admin) {
    return reply.code(403).send(formatError('Not an admin account', 'NOT_ADMIN'))
  }

  // Verify current password
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: admin.email,
    password: current_password,
  })

  if (verifyError) {
    return reply.code(400).send(formatError('Current password is incorrect', 'INVALID_PASSWORD'))
  }

  // Update to new password
  const { error: updateError } = await supabase.auth.admin.updateUserById(request.user!.id, {
    password: new_password,
  })

  if (updateError) {
    request.log.error({ error: updateError }, 'Admin password update failed')
    return reply.code(500).send(formatError('Failed to update password'))
  }

  request.log.info({ adminId: admin.id }, 'Admin password updated')

  return reply.send(formatResponse({
    message: 'Password updated successfully.',
  }))
})

/**
 * GET /auth/admin/me
 * Returns the current admin's info if authenticated AND is a valid admin.
 * This prevents regular users from accessing the admin panel.
 */
fastify.get('/admin/me', async (request, reply) => {
  const token = (request.cookies as Record<string, string | undefined>)?.[COOKIE_NAME]
    ?? request.headers.authorization?.substring(7)

  if (!token) {
    return reply.code(401).send(formatError('Not authenticated', 'UNAUTHORIZED'))
  }

  const supabase = getSupabase()
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return reply.code(401).send(formatError('Invalid session', 'UNAUTHORIZED'))
  }

  // Verify this user is in the admins table and is active
  const { data: admin, error: adminErr } = await supabase
    .from('admins')
    .select('id, email, full_name, role, is_active')
    .eq('auth_user_id', user.id)
    .single()

  if (adminErr || !admin) {
    return reply.code(403).send(formatError('Not an admin account', 'NOT_ADMIN'))
  }

  if (!admin.is_active) {
    return reply.code(403).send(formatError('Admin account is deactivated', 'ADMIN_INACTIVE'))
  }

  const output = AdminLoginOutput.parse({
    admin_id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role: admin.role,
  })
  return reply.send(formatResponse(output))
})
}

export default adminAuthRoutes
