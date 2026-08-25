import { Pool } from 'pg'
let pool: Pool | undefined
export function useDatabase() {
  if (!pool) {
    const config = useRuntimeConfig()
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required')
    }
    pool = new Pool({ connectionString: config.databaseUrl as string, max: 10 })
  }
  return pool
}
