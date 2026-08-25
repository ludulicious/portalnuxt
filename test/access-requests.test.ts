import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCESS_REQUEST_STATUSES, accessRequestInputSchema } from '../shared/access-requests'

test('access request lifecycle includes review and provisioning states', () => {
  assert.deepEqual(ACCESS_REQUEST_STATUSES, ['NEW', 'REVIEWING', 'APPROVED', 'DECLINED', 'PROVISIONING', 'PROVISIONED'])
})

test('access requests normalize email and slug while requiring qualification and consent', () => {
  const parsed = accessRequestInputSchema.parse({
    name: 'Ada Lovelace',
    email: 'ADA@EXAMPLE.COM',
    organization: 'Analytical Engines',
    website: '',
    intendedUse: 'A customer portal for service delivery and secure collaboration.',
    expectedUsers: '11-50',
    desiredTimeline: '1-3-months',
    preferredSlug: 'analytical-engines',
    consent: true,
    termsAccepted: true
  })
  assert.equal(parsed.email, 'ada@example.com')
  assert.equal(parsed.preferredSlug, 'analytical-engines')
  assert.equal(accessRequestInputSchema.safeParse({ ...parsed, consent: false }).success, false)
  assert.equal(accessRequestInputSchema.safeParse({ ...parsed, termsAccepted: false }).success, false)
  assert.equal(accessRequestInputSchema.safeParse({ ...parsed, intendedUse: 'Too short' }).success, false)
})
