import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import { processProvisioningWork } from '../server/utils/provisioning'
import { CoolifyProvider } from '../server/utils/coolify-provider'

test('instance creation provisions the selected domain, defaults blank domains, and rejects reserved or duplicate addresses', async () => {
  let customDomain: string | undefined = ' Portal.Example.COM '
  let duplicate = false
  const statements: Array<{ sql: string; values?: unknown[] }> = []
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireOperator: async () => ({ user: { id: 'operator' } }),
    readBody: async () => ({ name: 'Company', slug: 'company', adminEmail: 'admin@example.com', customDomain }),
    createError: (details: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(details.statusMessage), details),
    useRuntimeConfig: () => ({
      portalBaseDomain: 'portals.example.net',
      portalImage: 'registry/portal',
      resendApiKey: 'test',
      resendFromEmail: 'portal@example.com'
    }),
    resolvePortalRelease: async () => ({ version: '1.0.0', image: 'registry/portal:1.0.0' }),
    generatePortalEncryptionKey: () => 'test-key',
    encryptSecret: () => 'encrypted-key',
    mapInstance: (row: unknown) => row,
    useDatabase: () => ({
      query: async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values })
        if (duplicate && sql.startsWith('INSERT INTO platform_instance')) {
          throw Object.assign(new Error('Unique constraint'), { code: '23505' })
        }
        return { rows: [{ domain: values?.[4] }] }
      }
    })
  })
  const { default: handler } = await import('../server/api/instances/index.post')
  const invoke = () => handler({} as H3Event)
  await invoke()
  assert.equal(statements[0]?.values?.[4], 'portal.example.com')
  assert.ok(
    statements.some(
      ({ sql, values }) => sql.includes('instance.created') && String(values?.[3]).includes('portal.example.com')
    )
  )
  for (customDomain of [undefined, '', '   ', 'company.portals.example.net']) {
    statements.length = 0
    await invoke()
    assert.equal(statements[0]?.values?.[4], 'company.portals.example.net')
  }
  for (customDomain of ['other.portals.example.net', 'portals.example.net']) {
    statements.length = 0
    await assert.rejects(invoke, { statusCode: 409 })
    assert.equal(statements.length, 0)
  }
  customDomain = 'https://portal.example.com'
  await assert.rejects(invoke, { statusCode: 422 })
  customDomain = 'portal.example.com'
  duplicate = true
  await assert.rejects(invoke, { statusCode: 409 })
})

test('a deployed portal domain change updates only URL variables before deployment', async () => {
  const statements: string[] = []
  const configured: unknown[] = []
  Object.assign(globalThis, {
    useDatabase: () => ({
      query: async (sql: string) => {
        statements.push(sql)
        if (sql.startsWith('WITH candidate')) {
          return { rows: [{ id: 'instance', provisioning_step: 'ENVIRONMENT' }] }
        }
        if (sql.startsWith('SELECT domain_configuration_pending')) {
          return { rows: [{ domain_configuration_pending: true }] }
        }
        return { rows: [] }
      }
    }),
    findInstance: async () => ({
      id: 'instance',
      domain: 'portal.example.com',
      deployedVersion: '1.0.0',
      coolifyApplicationUuid: 'application'
    }),
    deploymentProvider: () => ({
      configure: async (...args: unknown[]) => {
        configured.push(args)
      }
    })
  })
  assert.equal(await processProvisioningWork(), true)
  assert.deepEqual(configured, [
    [
      'application',
      {
        PUBLIC_URL: 'https://portal.example.com',
        BETTER_AUTH_URL: 'https://portal.example.com'
      }
    ]
  ])
  assert.ok(statements.some((sql) => sql.includes("domain_configuration_pending=false,provisioning_step='DEPLOYMENT'")))
  assert.ok(!statements.some((sql) => sql.includes('SELECT encrypted_database_url')))
})

test('Coolify applies a custom domain to the existing application', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify(init?.method ? {} : [{ uuid: 'application', name: 'portal-company' }]))
  }
  try {
    const provider = new CoolifyProvider({
      url: 'https://coolify.example.com',
      token: 'test',
      projectUuid: 'project',
      serverUuid: 'server',
      environment: 'production'
    })
    assert.equal(
      await provider.ensureApplication({
        instanceId: 'instance',
        slug: 'company',
        name: 'Company',
        domain: 'portal.example.com',
        image: 'registry.example.com/portal:1.0.0',
        applicationUuid: 'application'
      }),
      'application'
    )
    assert.equal(calls[1]?.url, 'https://coolify.example.com/api/v1/applications/application')
    assert.equal(calls[1]?.init?.method, 'PATCH')
    assert.equal(JSON.parse(String(calls[1]?.init?.body)).domains, 'https://portal.example.com')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('domain changes require operator access, protect busy instances, and audit the queued change', async () => {
  let operatorAllowed = true
  let status = 'ACTIVE'
  let domain = 'portal.example.com'
  let duplicate = false
  const statements: Array<{ sql: string; values?: unknown[] }> = []
  const httpError = (details: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(details.statusMessage), details)
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireOperator: async () => {
      if (!operatorAllowed) {
        throw httpError({ statusCode: 403, statusMessage: 'Forbidden' })
      }
      return { user: { id: 'operator' } }
    },
    getRouterParam: () => 'instance',
    readBody: async () => ({ domain }),
    createError: httpError,
    useRuntimeConfig: () => ({ portalBaseDomain: 'portals.example.net' }),
    findInstance: async () => ({ id: 'instance', domain }),
    useDatabase: () => ({
      connect: async () => ({
        query: async (sql: string, values?: unknown[]) => {
          statements.push({ sql, values })
          if (sql.startsWith('SELECT')) {
            return {
              rows: [
                {
                  slug: 'company',
                  domain: 'company.portals.example.net',
                  status,
                  locked_at: null,
                  deployed_version: '1.0.0'
                }
              ]
            }
          }
          if (duplicate && sql.startsWith('UPDATE')) {
            throw Object.assign(new Error('Unique constraint'), { code: '23505' })
          }
          return { rows: [] }
        },
        release: () => {}
      })
    })
  })
  const { default: handler } = await import('../server/api/operator/instances/[id]/domain.patch')
  const invoke = () => handler({} as H3Event)
  operatorAllowed = false
  await assert.rejects(invoke, { statusCode: 403 })
  assert.equal(statements.length, 0)
  operatorAllowed = true
  status = 'PROVISIONING'
  await assert.rejects(invoke, { statusCode: 409 })
  status = 'ACTIVE'
  domain = 'other.portals.example.net'
  await assert.rejects(invoke, { statusCode: 409 })
  domain = 'https://portal.example.com'
  await assert.rejects(invoke, { statusCode: 422 })
  domain = 'portal.example.com'
  duplicate = true
  await assert.rejects(invoke, { statusCode: 409 })
  duplicate = false
  statements.length = 0
  await invoke()
  assert.ok(
    statements.some(
      ({ sql, values }) =>
        sql.startsWith('UPDATE') &&
        sql.includes("status='QUEUED'") &&
        sql.includes('domain_configuration_pending=true') &&
        values?.[1] === domain
    )
  )
  assert.ok(statements.some(({ sql, values }) => sql.includes('instance.domain-changed') && values?.[2] === 'operator'))
  assert.equal(statements.at(-1)?.sql, 'COMMIT')
})
