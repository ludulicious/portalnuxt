import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'

test('health recheck queues only an unlocked failed health step and audits successful requests', async () => {
  const statements: string[] = []
  let eligible = true
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireOperator: async () => ({ user: { id: 'operator' } }),
    getRouterParam: () => 'instance',
    findInstance: async () => ({ id: 'instance' }),
    readBody: async () => ({ action: 'recheck' }),
    createError: (details: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(details.statusMessage), details),
    useDatabase: () => ({
      query: async (sql: string) => {
        statements.push(sql)
        return { rowCount: eligible ? 1 : 0, rows: [] }
      }
    })
  })
  const { default: handler } = await import('../server/api/operator/instances/[id].patch')
  await handler({} as H3Event)
  assert.match(statements[0]!, /status='ERROR' AND provisioning_step='HEALTH' AND locked_at IS NULL/)
  assert.match(statements[0]!, /health_check_started_at=now\(\)/)
  assert.doesNotMatch(statements[0]!, /SET[^]*coolify_deployment_uuid|desired_image=/)
  assert.match(statements[1]!, /INSERT INTO audit_event/)
  eligible = false
  statements.length = 0
  await assert.rejects(() => handler({} as H3Event), { statusCode: 409 })
  assert.equal(statements.length, 1)
})

test('active health checks report success, HTTP failures and unreachable sites without changing deployment state', async () => {
  const statements: string[] = []
  let outcome: number | 'unreachable' = 200
  const originalFetch = globalThis.fetch
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireOperator: async () => ({ user: { id: 'operator' } }),
    getRouterParam: () => 'instance',
    findInstance: async () => ({ id: 'instance', status: 'ACTIVE', domain: 'portal.example.com' }),
    readBody: async () => ({ action: 'recheck' }),
    useDatabase: () => ({
      query: async (sql: string) => {
        statements.push(sql)
        return { rows: [] }
      }
    }),
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(url, 'https://portal.example.com/api/health')
      assert.ok(options.signal)
      if (outcome === 'unreachable') {
        throw new Error('Connection failed')
      }
      return { ok: outcome === 200, status: outcome }
    }
  })
  try {
    const { default: handler } = await import('../server/api/operator/instances/[id].patch')
    for (const value of [200, 503, 'unreachable'] as const) {
      outcome = value
      statements.length = 0
      const result = await handler({} as H3Event)
      assert.equal(result?.healthCheck?.healthy, value === 200)
      assert.equal(result?.status, 'ACTIVE')
      assert.equal(statements.length, 1)
      assert.match(statements[0]!, /INSERT INTO audit_event/)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
