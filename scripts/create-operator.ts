import { randomUUID } from 'node:crypto'
import { loadEnvFile } from 'node:process'
import { hashPassword } from 'better-auth/crypto'
import { Pool } from 'pg'

try {
  loadEnvFile()
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw error
  }
}
const email = String(process.argv[2] || '')
  .trim()
  .toLowerCase()
const password = String(process.argv[3] || '')
const name = String(process.argv[4] || 'PortalNuxt operator').trim()
const allowed = String(process.env.OPERATOR_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
if (!email || !allowed.includes(email)) {
  throw new Error('Email must be present in OPERATOR_EMAILS')
}
if (password.length < 12) {
  throw new Error('Use a password of at least 12 characters')
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
try {
  const existing = await pool.query<{ id: string }>('SELECT id FROM "user" WHERE lower(email)=$1', [email])
  const userId = existing.rows[0]?.id || randomUUID()
  const passwordHash = await hashPassword(password)
  await pool.query('BEGIN')
  await pool.query(
    `INSERT INTO "user" (id,name,email,"emailVerified") VALUES ($1,$2,$3,true)
    ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,"emailVerified"=true,"updatedAt"=now()`,
    [userId, name, email]
  )
  await pool.query(
    `INSERT INTO account (id,"accountId","providerId","userId",password) VALUES ($1,$2,'credential',$2,$3)
    ON CONFLICT (id) DO UPDATE SET password=EXCLUDED.password,"updatedAt"=now()`,
    [`credential:${userId}`, userId, passwordHash]
  )
  await pool.query('COMMIT')
  console.log(`PortalNuxt operator ready: ${email}`)
} catch (error) {
  await pool.query('ROLLBACK')
  throw error
} finally {
  await pool.end()
}
