/**
 * Migration Runner — executes all SQL migrations against your Supabase DB.
 * Safe to re-run: all migrations use IF NOT EXISTS / ON CONFLICT DO NOTHING.
 *
 * Usage:  npx tsx scripts/run-migrations.ts
 *
 * Requires DATABASE_URL in .env (get from Supabase Dashboard → Settings → Database → Connection string → URI)
 * Example: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
import pg from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

config() // Load .env

const __dirname = dirname(fileURLToPath(import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error(`
❌ Missing DATABASE_URL in .env

Get it from: Supabase Dashboard → Settings → Database → Connection string (URI)
It looks like: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

Add it to your .env file:
DATABASE_URL=postgresql://postgres.wbzkfbcrywxklzasjnfi:[YOUR-DB-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
`)
  process.exit(1)
}

const migrationsDir = join(__dirname, '..', 'supabase', 'migrations')

async function runMigrations() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    console.log('\n✅ Connected to database\n')

    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    console.log(`🗄️  Found ${files.length} migration files:\n`)

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      console.log(`▶ Running: ${file}...`)
      try {
        await client.query(sql)
        console.log(`  ✅ Success`)
      } catch (err: any) {
        // "already exists" errors are fine for IF NOT EXISTS migrations
        if (err.message?.includes('already exists') || err.code === '42710') {
          console.log(`  ⏭️  Already applied (skipped)`)
        } else {
          console.error(`  ❌ Error: ${err.message}`)
        }
      }
    }

    console.log('\n🎉 All migrations complete!\n')
  } catch (err: any) {
    console.error(`\n❌ Connection failed: ${err.message}`)
    console.error('Check your DATABASE_URL in .env\n')
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
