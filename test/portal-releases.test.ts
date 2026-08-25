import test from 'node:test'
import assert from 'node:assert/strict'
import { comparePortalVersions, parsePortalImageLocation } from '../server/utils/portal-releases'
import { isReleaseTransitionAllowed } from '../shared/release-policy'

test('portal image configuration accepts only an untagged GHCR repository', () => {
  assert.deepEqual(parsePortalImageLocation('ghcr.io/ludulicious/nuxt-customer-portal'), {
    location: 'ghcr.io/ludulicious/nuxt-customer-portal',
    repository: 'ludulicious/nuxt-customer-portal'
  })
  assert.throws(() => parsePortalImageLocation('ghcr.io/ludulicious/nuxt-customer-portal:1.2.3'))
  assert.throws(() => parsePortalImageLocation('ghcr.io/ludulicious/nuxt-customer-portal@sha256:abc'))
  assert.throws(() => parsePortalImageLocation('registry.example.com/ludulicious/nuxt-customer-portal'))
})

test('stable portal releases sort by semantic version', () => {
  assert.ok(comparePortalVersions('1.10.0', '1.9.9') > 0)
  assert.ok(comparePortalVersions('v2.0.0', '1.99.99') > 0)
})

test('release policy permits upgrades and only one-release downgrades', () => {
  const releases = ['0.1.6', '0.1.5', '0.1.4', '0.1.3']

  assert.equal(isReleaseTransitionAllowed('0.1.5', '0.1.6', releases), true)
  assert.equal(isReleaseTransitionAllowed('0.1.5', '0.1.5', releases), true)
  assert.equal(isReleaseTransitionAllowed('0.1.5', '0.1.4', releases), true)
  assert.equal(isReleaseTransitionAllowed('0.1.5', '0.1.3', releases), false)
  assert.equal(isReleaseTransitionAllowed('0.1.7', '0.1.6', releases), false)
  assert.equal(isReleaseTransitionAllowed(null, '0.1.3', releases), true)
})
