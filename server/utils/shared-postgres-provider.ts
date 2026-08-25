import { createHash, randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import type { DatabaseProvider, DatabaseResource, DatabaseSpec } from './providers'
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
export function tenantDatabaseUrl(baseUrl: string, roleName: string, password: string, databaseName: string) {
  const url = new URL(baseUrl)
  url.username = roleName
  url.password = password
  url.pathname = `/${databaseName}`
  return url.toString()
}
export function portalDatabaseIdentifier(slug: string) {
  const value = `portal-${slug}`
  if (Buffer.byteLength(value, 'utf8') <= 63) {
    return value
  }
  const hash = createHash('sha256').update(slug).digest('hex').slice(0, 8)
  return `${value.slice(0, 54)}-${hash}`
}
export class SharedPostgresProvider implements DatabaseProvider {
  constructor(
    private readonly adminUrl: string,
    private readonly runtimeUrl = adminUrl
  ) {}
  private adminRoute(databaseUrl: string) {
    const url = new URL(databaseUrl)
    const admin = new URL(this.adminUrl)
    url.protocol = admin.protocol
    url.hostname = admin.hostname
    url.port = admin.port
    url.search = admin.search
    return url.toString()
  }
  async ensure(spec: DatabaseSpec): Promise<DatabaseResource> {
    const roleName = portalDatabaseIdentifier(spec.slug)
    const databaseName = roleName
    const password = randomBytes(24).toString('base64url')
    const pool = new Pool({ connectionString: this.adminUrl, max: 1 })
    try {
      const role = await pool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [roleName])
      if (!role.rowCount) {
        await pool.query(
          `CREATE ROLE ${identifier(roleName)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
        )
      } else {
        await pool.query(`ALTER ROLE ${identifier(roleName)} PASSWORD ${literal(password)}`)
      }
      const database = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName])
      if (!database.rowCount) {
        await pool.query(`CREATE DATABASE ${identifier(databaseName)} OWNER ${identifier(roleName)}`)
      }
      return {
        databaseName,
        roleName,
        databaseUrl: tenantDatabaseUrl(this.runtimeUrl, roleName, password, databaseName)
      }
    } finally {
      await pool.end()
    }
  }
  async validate(databaseUrl: string) {
    const pool = new Pool({ connectionString: this.adminRoute(databaseUrl), max: 1 })
    try {
      await pool.query('SELECT 1')
    } finally {
      await pool.end()
    }
  }
}
