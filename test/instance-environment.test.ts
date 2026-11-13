import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import { managedEnvironmentNames, portalEnvironmentSchema } from '../shared/portal-environment'
import { portalCreateSchema } from '../shared/portal-validation'
import { decryptSecret, encryptSecret } from '../server/utils/crypto'
import { decodeInstanceEnvironment } from '../server/utils/instance-environment'
import { mapInstance } from '../server/utils/instances'
import { processProvisioningWork } from '../server/utils/provisioning'
import { portalDatabaseIdentifier } from '../server/utils/shared-postgres-provider'

const demoVariables = [
  { name: 'NUXT_PORTAL_DEMO_ENABLED', value: 'true' },
  { name: 'NUXT_PUBLIC_PORTAL_DEMO_ENABLED', value: 'true' }
]
const input = { name: 'Demo portal', slug: 'demo-portal', adminEmail: 'admin@example.com' }
process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'test-environment-encryption-key'

test('extra environment validation preserves literal values and rejects invalid, duplicate, oversized, or managed names', () => {
  assert.deepEqual(portalCreateSchema.parse(input).environmentVariables, [])
  const literal = '  value=$literal="quoted"\nsecond line  '
  assert.deepEqual(portalEnvironmentSchema.parse([{ name: ' EXTRA_SETTING ', value: literal }]), [
    { name: 'EXTRA_SETTING', value: literal }
  ])
  assert.equal(portalEnvironmentSchema.safeParse([{ name: 'EMPTY_SETTING', value: '' }]).success, true)
  for (const name of ['', '1KEY', 'KEY-NAME', 'KEY NAME', 'KEY=VALUE', 'a'.repeat(129)]) {
    assert.equal(portalEnvironmentSchema.safeParse([{ name, value: '' }]).success, false, name)
  }
  for (const name of managedEnvironmentNames.flatMap((name) => [name, `NUXT_${name}`, name.toLowerCase()])) {
    assert.equal(portalEnvironmentSchema.safeParse([{ name, value: 'override' }]).success, false, name)
  }
  for (const variables of [
    [
      { name: 'EXTRA', value: 'a' },
      { name: ' EXTRA ', value: 'b' }
    ],
    [{ name: 'EXTRA', value: 'a\0b' }],
    [{ name: 'EXTRA', value: 'a'.repeat(16385) }],
    Array.from({ length: 51 }, (_, index) => ({ name: `EXTRA_${index}`, value: '' })),
    Array.from({ length: 9 }, (_, index) => ({ name: `EXTRA_${index}`, value: 'a'.repeat(16384) })),
    [demoVariables[0]!],
    [demoVariables[1]!]
  ]) {
    assert.equal(portalEnvironmentSchema.safeParse(variables).success, false)
  }
  assert.deepEqual(portalEnvironmentSchema.parse(demoVariables), demoVariables)
})

test('demo databases keep the required suffix within PostgreSQL identifier limits', () => {
  assert.equal(portalDatabaseIdentifier('demo-portal', true), 'portal-demo-portal_demo')
  assert.equal(portalDatabaseIdentifier('ordinary'), 'portal-ordinary')
  const longName = portalDatabaseIdentifier('a'.repeat(63), true)
  assert.equal(Buffer.byteLength(longName), 63)
  assert.match(longName, /-[a-f0-9]{8}_demo$/)
  assert.notEqual(longName, portalDatabaseIdentifier('a'.repeat(62) + 'b', true))
})

test('stored variables are encrypted, support legacy instances, and never echo corrupted values', () => {
  const variables = [{ name: 'EXTRA_TOKEN', value: 'sensitive-token' }]
  const encrypted = encryptSecret(JSON.stringify(variables))
  assert.doesNotMatch(encrypted, /EXTRA_TOKEN|sensitive-token/)
  assert.deepEqual(decodeInstanceEnvironment(encrypted), variables)
  assert.deepEqual(decodeInstanceEnvironment(null), [])
  assert.throws(() => decodeInstanceEnvironment(encryptSecret('sensitive invalid JSON')), {
    message: 'Stored instance environment variables could not be read'
  })
})

test('both creation endpoints encrypt optional variables without returning or auditing them, and reject invalid input', async () => {
  let environmentVariables = [{ name: 'EXTRA_TOKEN', value: 'sensitive-token' }]
  let allowed = true
  const statements: Array<{ sql: string; values?: unknown[] }> = []
  const query = async (sql: string, values?: unknown[]) => {
    statements.push({ sql, values })
    if (sql.startsWith('SELECT * FROM access_request')) {
      return { rows: [{ status: 'APPROVED' }] }
    }
    return {
      rows: [
        { id: 'instance', encrypted_environment_variables: values?.[8], created_at: new Date(), updated_at: new Date() }
      ]
    }
  }
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireOperator: async () => {
      if (!allowed) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
      return { user: { id: 'operator' } }
    },
    getRouterParam: () => 'request',
    readBody: async () => ({ ...input, environmentVariables }),
    createError: (details: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(details.statusMessage), details),
    useRuntimeConfig: () => ({
      portalBaseDomain: 'example.com',
      portalImage: 'registry/portal',
      resendApiKey: 'test',
      resendFromEmail: 'portal@example.com'
    }),
    resolvePortalRelease: async () => ({ image: 'registry/portal:1.0.0', version: '1.0.0' }),
    generatePortalEncryptionKey: () => 'test-key',
    encryptSecret,
    mapInstance,
    useDatabase: () => ({ query, connect: async () => ({ query, release: () => {} }) })
  })
  const { default: direct } = await import('../server/api/instances/index.post')
  const { default: fromRequest } = await import('../server/api/operator/access-requests/[id]/provision.post')
  for (const handler of [direct, fromRequest]) {
    statements.length = 0
    const response = await handler({} as H3Event)
    const inserted = statements.find(({ sql }) => sql.startsWith('INSERT INTO platform_instance'))!
    assert.match(inserted.sql, /encrypted_environment_variables/)
    assert.deepEqual(decodeInstanceEnvironment(inserted.values?.[8] as string), environmentVariables)
    assert.doesNotMatch(JSON.stringify(statements), /sensitive-token/)
    assert.doesNotMatch(
      JSON.stringify(response),
      /sensitive-token|encrypted_environment_variables|environmentVariables/
    )
    const original = environmentVariables
    environmentVariables = [{ name: 'DATABASE_URL', value: 'override' }]
    statements.length = 0
    await assert.rejects(() => handler({} as H3Event), { statusCode: 422 })
    assert.equal(statements.length, 0)
    environmentVariables = original
    allowed = false
    await assert.rejects(() => handler({} as H3Event), { statusCode: 403 })
    allowed = true
    environmentVariables = []
    statements.length = 0
    await handler({} as H3Event)
    assert.equal(statements.find(({ sql }) => sql.startsWith('INSERT INTO platform_instance'))?.values?.[8], null)
    environmentVariables = original
  }
})

test('initial provisioning and retries apply stored variables before deployment; deployed portals retain their settings', async () => {
  let step = 'DATABASE'
  let deployedVersion: string | null = null
  let variables = [...demoVariables, { name: 'EXTRA_TOKEN', value: 'literal=$value\nsecond line' }]
  const configured: Array<Record<string, string>> = []
  const databaseSpecs: unknown[] = []
  const statements: string[] = []
  Object.assign(globalThis, {
    useDatabase: () => ({
      query: async (sql: string) => {
        statements.push(sql)
        if (sql.startsWith('WITH candidate')) {
          return { rows: [{ id: 'instance', provisioning_step: step }] }
        }
        if (sql.startsWith('SELECT encrypted_')) {
          return {
            rows: [
              {
                encrypted_environment_variables: variables.length ? encryptSecret(JSON.stringify(variables)) : null,
                encrypted_database_url: encryptSecret('postgresql://tenant:password@db/portal_demo'),
                encrypted_auth_secret: encryptSecret('auth-secret'),
                encrypted_portal_encryption_key: encryptSecret('portal-key')
              }
            ]
          }
        }
        return { rows: [] }
      }
    }),
    findInstance: async () => ({
      id: 'instance',
      ...input,
      domain: 'demo.example.com',
      deployedVersion,
      coolifyApplicationUuid: 'application'
    }),
    useRuntimeConfig: () => ({ resendApiKey: 'email-key', resendFromEmail: 'portal@example.com' }),
    encryptSecret,
    decryptSecret,
    databaseProvider: () => ({
      ensure: async (spec: unknown) => {
        databaseSpecs.push(spec)
        return { databaseName: 'portal_demo', roleName: 'portal', databaseUrl: 'postgresql://db/portal_demo' }
      },
      validate: async () => {}
    }),
    deploymentProvider: () => ({
      configure: async (_uuid: string, environment: Record<string, string>) => {
        configured.push(environment)
      }
    })
  })
  await processProvisioningWork()
  assert.deepEqual(databaseSpecs, [{ instanceId: 'instance', slug: input.slug, demo: true }])
  step = 'ENVIRONMENT'
  for (let attempt = 0; attempt < 2; attempt++) {
    await processProvisioningWork()
    assert.equal(configured[attempt]?.EXTRA_TOKEN, variables[2]!.value)
    assert.equal(configured[attempt]?.NUXT_PORTAL_DEMO_ENABLED, 'true')
    assert.equal(configured[attempt]?.NUXT_PUBLIC_PORTAL_DEMO_ENABLED, 'true')
    assert.equal(configured[attempt]?.DATABASE_URL, 'postgresql://tenant:password@db/portal_demo')
    assert.equal(configured[attempt]?.PORTAL_ENCRYPTION_KEY, 'portal-key')
  }
  deployedVersion = '1.0.0'
  statements.length = 0
  await processProvisioningWork()
  assert.equal(configured.length, 2)
  assert.ok(!statements.some((sql) => sql.startsWith('SELECT encrypted_')))
  deployedVersion = null
  variables = []
  await processProvisioningWork()
  assert.equal(configured[2]?.NUXT_PORTAL_DEMO_ENABLED, undefined)
  assert.equal(configured[2]?.EXTRA_TOKEN, undefined)
  assert.equal(configured[2]?.NODE_ENV, 'production')
})
