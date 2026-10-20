import assert from 'node:assert/strict'
import test from 'node:test'
import { INSTANCE_STATUSES, PROVISIONING_STEPS } from '../shared/control-plane'
import { portalCreateSchema, portalDomainSchema, portalSlugSchema } from '../shared/portal-validation'
import { decryptSecret, encryptSecret, generatePortalEncryptionKey } from '../server/utils/crypto'
import {
  sanitizeProvisioningError,
  shouldConfigureEnvironment,
  shouldEnsureApplicationForDeployment
} from '../server/utils/provisioning'
import { parseCoolifyImageReference } from '../server/utils/coolify-provider'
import { portalDatabaseIdentifier, tenantDatabaseUrl } from '../server/utils/shared-postgres-provider'

test('lifecycle and provisioning vocabularies are explicit', () => {
  assert.deepEqual(INSTANCE_STATUSES, [
    'PENDING_EMAIL',
    'QUEUED',
    'PROVISIONING',
    'ACTIVE',
    'ERROR',
    'SUSPENDED',
    'DELETION_SCHEDULED'
  ])
  assert.equal(PROVISIONING_STEPS.at(-1), 'COMPLETE')
})
test('control-plane secrets round trip without storing plaintext', () => {
  process.env.CONTROL_PLANE_ENCRYPTION_KEY = 'test-key-with-sufficient-entropy'
  const encrypted = encryptSecret('postgresql://owner:secret@database/portal')
  assert.doesNotMatch(encrypted, /secret/)
  assert.equal(decryptSecret(encrypted), 'postgresql://owner:secret@database/portal')
})
test('provisioning errors redact credentials and tokens', () => {
  const sanitized = sanitizeProvisioningError(new Error('failed postgresql://user:secret@db/portal with Bearer abc123'))
  assert.equal(sanitized, 'failed [database URL] with Bearer [redacted]')
})

test('Coolify image references split tags and immutable digests correctly', () => {
  assert.deepEqual(parseCoolifyImageReference('ghcr.io/ludulicious/customer-portal:1.2.3'), {
    imageName: 'ghcr.io/ludulicious/customer-portal',
    imageTag: '1.2.3'
  })
  assert.deepEqual(
    parseCoolifyImageReference(
      'ghcr.io/ludulicious/customer-portal@sha256:9e200d9a6ddd5d1ba7a5e5a05a901287160b195b31298b2866735ca089d3907f'
    ),
    {
      imageName: 'ghcr.io/ludulicious/customer-portal',
      imageTag: 'sha256-9e200d9a6ddd5d1ba7a5e5a05a901287160b195b31298b2866735ca089d3907f'
    }
  )
})

test('portal encryption keys match openssl rand -base64 32 output', () => {
  const encryptionKey = generatePortalEncryptionKey()
  assert.equal(Buffer.from(encryptionKey, 'base64').byteLength, 32)
  assert.match(encryptionKey, /^[A-Za-z0-9+/]{43}=$/)
})

test('environment variables are configured only for portals that have not been deployed', () => {
  assert.equal(shouldConfigureEnvironment(null), true)
  assert.equal(shouldConfigureEnvironment('0.4.2'), false)
  assert.equal(shouldConfigureEnvironment('0.4.2', true), true)
})

test('custom domains normalize hostnames and reject URLs, IPs and invalid DNS labels', () => {
  assert.equal(portalDomainSchema.parse(' Portal.Example.COM '), 'portal.example.com')
  for (const domain of ['example.com', 'portal.example.co.uk', 'xn--bcher-kva.example']) {
    assert.equal(portalDomainSchema.safeParse(domain).success, true, domain)
  }
  for (const domain of [
    '',
    'localhost',
    'https://example.com',
    'example.com/path',
    'example.com:443',
    'user@example.com',
    '*.example.com',
    '127.0.0.1',
    '[::1]',
    'bad_label.example.com',
    '-bad.example.com',
    'bad-.example.com',
    'example..com',
    'example.com.',
    `${'a'.repeat(64)}.com`,
    `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`
  ]) {
    assert.equal(portalDomainSchema.safeParse(domain).success, false, domain)
  }
})

test('instance creation accepts an optional custom domain and normalizes it', () => {
  const input = { name: 'Company', slug: 'company', adminEmail: 'admin@example.com' }
  assert.equal(portalCreateSchema.parse(input).customDomain, undefined)
  assert.equal(portalCreateSchema.parse({ ...input, customDomain: '   ' }).customDomain, '')
  assert.equal(
    portalCreateSchema.parse({ ...input, customDomain: ' Portal.Example.COM ' }).customDomain,
    'portal.example.com'
  )
  assert.equal(portalCreateSchema.safeParse({ ...input, customDomain: 'https://portal.example.com' }).success, false)
})

test('deployment status polling does not reconfigure the Coolify application', () => {
  assert.equal(shouldEnsureApplicationForDeployment(null), true)
  assert.equal(shouldEnsureApplicationForDeployment('deployment-uuid'), false)
})

test('portal slugs allow DNS-safe labels and reject ambiguous hyphens', () => {
  assert.equal(portalSlugSchema.safeParse('marpos-portal2').success, true)
  for (const slug of ['Marpos', 'marpos portal', '-marpos', 'marpos-', 'marpos--portal', 'ab']) {
    assert.equal(portalSlugSchema.safeParse(slug).success, false, slug)
  }
  assert.equal(
    portalCreateSchema.safeParse({ name: 'Marpos IT', slug: 'marpos-it', adminEmail: 'admin@marpos.nl' }).success,
    true
  )
  assert.equal(
    portalCreateSchema.safeParse({ name: 'Marpos IT', slug: 'marpos-it', adminEmail: 'invalid' }).success,
    false
  )
})

test('tenant database URLs use the portal runtime endpoint', () => {
  const url = new URL(
    tenantDatabaseUrl(
      'postgresql://admin:secret@postgres.internal:5432/postgres',
      'portal_tenant',
      'rotated-password',
      'portal_tenant'
    )
  )
  assert.equal(url.hostname, 'postgres.internal')
  assert.equal(url.port, '5432')
  assert.equal(url.username, 'portal_tenant')
  assert.equal(url.password, 'rotated-password')
  assert.equal(url.pathname, '/portal_tenant')
})

test('tenant database identifiers use the portal slug without a GUID', () => {
  assert.equal(portalDatabaseIdentifier('marpos'), 'portal-marpos')
  const longIdentifier = portalDatabaseIdentifier('a'.repeat(63))
  assert.equal(Buffer.byteLength(longIdentifier, 'utf8'), 63)
  assert.match(longIdentifier, /^portal-a+-[a-f0-9]{8}$/)
})
