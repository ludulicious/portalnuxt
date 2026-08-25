import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
export default defineNitroPlugin(async () => {
  const directory = resolve(process.cwd(), 'migrations')
  const pool = useDatabase()
  await pool.query(
    `CREATE TABLE IF NOT EXISTS control_plane_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
  )
  for (const file of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    const applied = await pool.query('SELECT 1 FROM control_plane_migration WHERE name=$1', [file])
    if (applied.rowCount) {
      continue
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(await readFile(resolve(directory, file), 'utf8'))
      await client.query('INSERT INTO control_plane_migration (name) VALUES ($1)', [file])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
})
