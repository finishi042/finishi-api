/**
 * Seed Super Admin — creates the default super admin in Supabase Auth
 * and links it to the admins table.
 *
 * Usage:  npx tsx scripts/seed-admin.ts
 *
 * Default credentials:
 *   Email:    admin@finishi.com
 *   Password: Admin@Finishi2024
 *
 * ⚠️  Change the password immediately after first login in production!
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config()

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ADMIN_EMAIL = 'admin@finishi.com'
const ADMIN_PASSWORD = 'Admin@Finishi2024'
const ADMIN_NAME = 'Finishi Super Admin'

async function seedAdmin() {
  console.log('\n🔑 Seeding super admin...\n')

  // 1. Create auth user (or skip if exists)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    app_metadata: { role: 'super_admin' },
    user_metadata: { full_name: ADMIN_NAME },
  })

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      console.log(`⏭️  Auth user ${ADMIN_EMAIL} already exists`)

      // Fetch the existing user to get their ID
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find(u => u.email === ADMIN_EMAIL)

      if (existing) {
        // Ensure app_metadata has the role
        await supabase.auth.admin.updateUserById(existing.id, {
          app_metadata: { role: 'super_admin' },
        })

        // Link to admins table
        await linkAdmin(existing.id)
      }
      return
    }
    console.error(`❌ Failed to create auth user: ${authError.message}`)
    process.exit(1)
  }

  console.log(`✅ Auth user created: ${authData.user.id}`)

  // 2. Link to admins table
  await linkAdmin(authData.user.id)
}

async function linkAdmin(authUserId: string) {
  // Check if admins table row exists
  const { data: existing } = await supabase
    .from('admins')
    .select('id, auth_user_id')
    .eq('email', ADMIN_EMAIL)
    .single()

  if (existing && existing.auth_user_id) {
    console.log(`⏭️  Admin table row already linked (id: ${existing.id})`)
  } else if (existing && !existing.auth_user_id) {
    // Row exists from migration but not linked — link it
    const { error } = await supabase
      .from('admins')
      .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) {
      console.error(`❌ Failed to link admin: ${error.message}`)
    } else {
      console.log(`✅ Linked existing admin row to auth user`)
    }
  } else {
    // No row — insert it
    const { error } = await supabase.from('admins').insert({
      auth_user_id: authUserId,
      email: ADMIN_EMAIL,
      full_name: ADMIN_NAME,
      role: 'super_admin',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      if (error.code === '23505') {
        console.log(`⏭️  Admin row already exists`)
      } else {
        console.error(`❌ Failed to create admin row: ${error.message}`)
      }
    } else {
      console.log(`✅ Admin table row created`)
    }
  }

  console.log(`
🎉 Super admin ready!

   Email:    ${ADMIN_EMAIL}
   Password: ${ADMIN_PASSWORD}

   ⚠️  Change this password after first login!
`)
}

seedAdmin().catch(err => {
  console.error('❌ Unexpected error:', err.message)
  process.exit(1)
})
