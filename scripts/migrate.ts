import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { Pool } from 'pg'
if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}
const pool = new Pool({ connectionString: databaseUrl })
try {
  const directory = resolve('migrations')
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    await pool.query(await readFile(resolve(directory, file), 'utf8'))
  }
  console.log(`Control-plane migrations applied (${files.length} files).`)
} finally {
  await pool.end()
}
