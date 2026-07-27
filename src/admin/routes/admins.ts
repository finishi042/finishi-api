/**
 * Admin management routes.
 * Allows super admins to list and delete admin accounts.
 */
import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'
import { requireSuperAdmin } from '../../shared/middleware/rbac.js'

const adminAdminsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /admins — List all admin accounts
   * Requires super_admin role
   */
  fastify.get('/admins', {
    onRequest: [requireSuperAdmin],
  }, wrapHandler('Failed to fetch admins', async (request, reply) => {
    const { data, error } = await request.supabase
      .from('admins')
      .select('id, email, full_name, role, is_active, last_login, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) throw error

    const admins = (data || []).map((admin: any) => ({
      admin_id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
      is_active: admin.is_active,
      last_login: admin.last_login,
      created_at: admin.created_at,
    }))

    return reply.send(formatResponse(admins))
  }))

  /**
   * DELETE /admins/:id — Delete an admin account
   * Requires super_admin role
   * Cannot delete super_admin accounts or yourself
   */
  fastify.delete<{ Params: { id: string } }>('/admins/:id', {
    onRequest: [requireSuperAdmin],
  }, wrapHandler('Failed to delete admin', async (request, reply) => {
    const { id } = request.params

    // Get the admin to be deleted
    const { data: targetAdmin, error: fetchErr } = await request.supabase
      .from('admins')
      .select('id, auth_user_id, role, email')
      .eq('id', id)
      .single()

    if (fetchErr || !targetAdmin) {
      return reply.code(404).send(formatError('Admin not found'))
    }

    // Prevent deleting super_admin accounts
    if (targetAdmin.role === 'super_admin') {
      return reply.code(403).send(formatError('Cannot delete super admin accounts', 'FORBIDDEN'))
    }

    // Get the current user's admin record
    const { data: currentAdmin } = await request.supabase
      .from('admins')
      .select('id')
      .eq('auth_user_id', request.user!.id)
      .single()

    // Prevent self-deletion
    if (currentAdmin && currentAdmin.id === id) {
      return reply.code(403).send(formatError('Cannot delete your own account', 'FORBIDDEN'))
    }

    // Soft delete by setting is_active to false
    const { error: updateErr } = await request.supabase
      .from('admins')
      .update({ 
        is_active: false, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)

    if (updateErr) throw updateErr

    // Optionally disable the Supabase Auth user
    if (targetAdmin.auth_user_id) {
      try {
        const { getSupabase } = await import('../../shared/supabase.js')
        const supabase = getSupabase()
        await supabase.auth.admin.updateUserById(targetAdmin.auth_user_id, {
          app_metadata: { disabled: true },
        })
      } catch (err) {
        request.log.warn({ err, adminId: id }, 'Failed to disable auth user')
      }
    }

    request.log.info({ adminId: id, deletedBy: request.user?.id }, 'Admin deleted')
    return reply.send(formatResponse({ deleted: true }))
  }))
}

export default adminAdminsRoutes
