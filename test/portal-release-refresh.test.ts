import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { H3Event } from 'h3'
import { refreshPortalReleases } from '../server/utils/portal-releases'

const location = 'ghcr.io/ludulicious/nuxt-customer-portal'
const digest = `sha256:${'a'.repeat(64)}`
const challenge =
  'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:ludulicious/nuxt-customer-portal:pull"'

function registryHarness(context: TestContext, tags: string[] | null) {
  const rows = new Map<string, { version: string; image_digest: string; discovered_at: Date }>()
  const requests: { url: string; options: RequestInit }[] = []
  let activeManifests = 0
  let maximumManifests = 0
  let manifestStatus = 200
  let manifestDigest = digest
  let failingVersion: string | undefined
  const statements: string[] = []
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ portalImage: location, registryUsername: 'test-user', registryToken: 'test-secret' }),
    useDatabase: () => ({
      query: async (sql: string, parameters?: string[]) => {
        statements.push(sql)
        if (parameters) {
          rows.set(parameters[0]!, {
            version: parameters[0]!,
            image_digest: parameters[1]!,
            discovered_at: new Date('2026-11-16T14:00:00Z')
          })
        }
        return { rows: [...rows.values()] }
      }
    })
  })
  context.mock.method(globalThis, 'fetch', async (input: string | URL, options: RequestInit) => {
    const url = String(input)
    requests.push({ url, options })
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal)
    if (url.startsWith('https://ghcr.io/token?')) {
      assert.match(new Headers(options.headers).get('Authorization')!, /^Basic /)
      return Response.json({ token: 'registry-access-token' })
    }
    if (!new Headers(options.headers).has('Authorization')) {
      return new Response(null, { status: 401, headers: { 'www-authenticate': challenge } })
    }
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer registry-access-token')
    if (url.endsWith('/tags/list?n=1000')) {
      return Response.json({ tags })
    }
    assert.equal(options.method, 'HEAD')
    assert.match(new Headers(options.headers).get('Accept')!, /application\/vnd\.oci\.image\.index/)
    activeManifests++
    maximumManifests = Math.max(maximumManifests, activeManifests)
    await setImmediate()
    activeManifests--
    const affected = !failingVersion || url.endsWith(`/manifests/${failingVersion}`)
    return new Response(null, {
      status: affected ? manifestStatus : 200,
      headers: { 'docker-content-digest': affected ? manifestDigest : digest }
    })
  })
  return {
    requests,
    rows,
    statements,
    maximumManifests: () => maximumManifests,
    failManifest: (status: number, value = digest, version?: string) => {
      manifestStatus = status
      manifestDigest = value
      failingVersion = version
    }
  }
}

test('concurrent refreshes share one uncached scan, authenticate once and resolve stable digests with bounded concurrency', async (context) => {
  const versions = [...Array.from({ length: 51 }, (_value, index) => `0.12.${index}`), '0.13.1', '0.13.2']
  const harness = registryHarness(context, [...versions, 'latest', '0.14.0-beta.1', 'main'])
  const first = refreshPortalReleases()
  const second = refreshPortalReleases()
  assert.equal(first, second)
  const catalogue = await first
  assert.equal(catalogue.length, 53)
  assert.equal(catalogue[0]?.version, '0.13.2')
  assert.equal(catalogue[0]?.image, `${location}@${digest}`)
  assert.equal(catalogue[2]?.version, '0.12.50')
  assert.equal(harness.requests.filter(({ url }) => url.startsWith('https://ghcr.io/token?')).length, 1)
  assert.equal(harness.requests.filter(({ url }) => url.includes('/manifests/')).length, 53)
  assert.equal(harness.maximumManifests(), 4)
  assert.equal(harness.statements.filter((sql) => sql.startsWith('INSERT')).length, 53)
  await refreshPortalReleases()
  assert.equal(harness.requests.filter(({ url }) => url.startsWith('https://ghcr.io/token?')).length, 2)
})

test('registry errors and invalid digests preserve saved releases and failed scans can be retried', async (context) => {
  const harness = registryHarness(context, ['0.13.1', '0.13.2'])
  harness.rows.set('0.13.1', {
    version: '0.13.1',
    image_digest: `${location}@${digest}`,
    discovered_at: new Date('2026-11-16T13:00:00Z')
  })
  for (const [status, value] of [
    [503, digest],
    [200, 'not-an-immutable-digest']
  ] as const) {
    harness.failManifest(status, value, '0.13.1')
    await assert.rejects(refreshPortalReleases(), /Could not resolve portal release|no immutable digest/)
    assert.equal(harness.statements.length, 0)
    assert.equal(harness.rows.size, 1)
  }
  harness.failManifest(200)
  assert.equal((await refreshPortalReleases())[0]?.version, '0.13.2')
})

test('registry deadline aborts stalled work, does not write, and releases the shared scan for retry', async (context) => {
  const harness = registryHarness(context, ['0.13.2'])
  const deadline = new AbortController()
  context.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
    assert.equal(milliseconds, 60_000)
    return deadline.signal
  })
  context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    await new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true })
    })
  })
  const refresh = refreshPortalReleases()
  deadline.abort(new DOMException('Registry deadline exceeded', 'TimeoutError'))
  await assert.rejects(refresh, { name: 'TimeoutError' })
  assert.equal(harness.statements.length, 0)
  context.mock.restoreAll()
  registryHarness(context, ['0.13.2'])
  assert.equal((await refreshPortalReleases())[0]?.version, '0.13.2')
})

test('empty registries do not crash or invent stable releases', async (context) => {
  registryHarness(context, null)
  assert.deepEqual(await refreshPortalReleases(), [])
})

test('listing and authentication failures reject without writing or sending credentials to an unexpected realm', async (context) => {
  const harness = registryHarness(context, ['0.13.2'])
  let tokenRequests = 0
  let scenario: 'listing' | 'realm' | 'authentication' | 'missing-token' = 'listing'
  context.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    if (String(input).startsWith('https://ghcr.io/token?')) {
      tokenRequests++
      return scenario === 'authentication' ? new Response(null, { status: 403 }) : Response.json({})
    }
    return new Response(null, {
      status: scenario === 'listing' ? 503 : 401,
      headers: {
        'www-authenticate': scenario === 'realm' ? 'Bearer realm="https://untrusted.example/token"' : challenge
      }
    })
  })
  for (const value of ['listing', 'realm', 'authentication', 'missing-token'] as const) {
    scenario = value
    await assert.rejects(refreshPortalReleases(), /Could not list|Unexpected GHCR|authentication failed|access token/)
    assert.equal(harness.statements.length, 0)
    if (scenario === 'realm') {
      assert.equal(tokenRequests, 0)
    }
  }
  assert.equal(tokenRequests, 2)
})

test('release API authorizes before access, disables caching and returns only safe refresh errors', async (context) => {
  let authorized = false
  let refreshRequested = true
  let shouldFail = false
  let refreshes = 0
  let reads = 0
  const headers: Record<string, string> = {}
  const catalogue = [{ version: '0.13.2', image: `${location}@${digest}`, discoveredAt: '2026-11-16T14:00:00Z' }]
  Object.assign(globalThis, {
    defineEventHandler: (handler: unknown) => handler,
    requireOperator: async () => {
      if (!authorized) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
    },
    setResponseHeader: (_event: H3Event, name: string, value: string) => (headers[name] = value),
    getQuery: () => ({ refresh: refreshRequested ? 'true' : undefined }),
    refreshPortalReleases: async () => {
      refreshes++
      if (shouldFail) {
        throw new Error('private registry credentials')
      }
      return catalogue
    },
    listPortalReleases: async () => {
      reads++
      return catalogue
    },
    sanitizeProvisioningError: () => 'sanitized registry failure',
    createError: (details: { statusCode: number; statusMessage: string }) =>
      Object.assign(new Error(details.statusMessage), details)
  })
  const logger = context.mock.method(console, 'error', () => {})
  const { default: handler } = await import('../server/api/operator/releases.get')
  await assert.rejects(handler({} as H3Event), { statusCode: 403 })
  assert.equal(refreshes + reads, 0)
  assert.deepEqual(headers, {})
  authorized = true
  assert.equal(await handler({} as H3Event), catalogue)
  assert.equal(refreshes, 1)
  assert.equal(reads, 0)
  assert.equal(headers['Cache-Control'], 'no-store')
  refreshRequested = false
  assert.equal(await handler({} as H3Event), catalogue)
  assert.equal(reads, 1)
  refreshRequested = true
  shouldFail = true
  await assert.rejects(handler({} as H3Event), {
    statusCode: 502,
    message: 'Portal releases could not be refreshed. Please try again.'
  })
  assert.deepEqual(logger.mock.calls[0]?.arguments, [
    'Manual portal release refresh failed:',
    'sanitized registry failure'
  ])
})
