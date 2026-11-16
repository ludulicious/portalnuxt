import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, ref } from 'vue'
import { useInventoryRefresh } from '../app/composables/useInventoryRefresh'

test('manual refresh updates reactive deployment choices before inventory finishes without refetching releases', async () => {
  const releases = ref([{ version: '0.13.1' }])
  const latest = computed(() => releases.value[0]?.version)
  const deploymentChoices = computed(() => releases.value.map((release) => release.version))
  let finishInventory!: (success: boolean) => void
  let fetches = 0
  const catalogue = [{ version: '0.13.2' }, { version: '0.13.1' }]
  const refresh = useInventoryRefresh({
    releases,
    fetchReleases: async () => {
      fetches++
      return catalogue
    },
    refreshInstances: () => new Promise<boolean>((resolve) => (finishInventory = resolve))
  })
  const request = refresh.refreshInventory()
  await Promise.resolve()
  assert.equal(latest.value, '0.13.2')
  assert.deepEqual(deploymentChoices.value, ['0.13.2', '0.13.1'])
  assert.equal(refresh.isRefreshingReleases.value, true)
  await refresh.refreshInventory()
  assert.equal(fetches, 1)
  finishInventory(true)
  await request
  assert.equal(refresh.isRefreshingReleases.value, false)
  assert.equal(refresh.refreshFailed.value, false)
  assert.match(refresh.refreshMessage.value, /Inventory refreshed\. New portal releases found\. Latest: 0\.13\.2/)
})

test('unchanged and empty catalogues have explicit success feedback', async () => {
  for (const catalogue of [[{ version: '0.13.2' }], []]) {
    const refresh = useInventoryRefresh({
      releases: ref(catalogue),
      fetchReleases: async () => catalogue,
      refreshInstances: async () => true
    })
    await refresh.refreshInventory()
    assert.equal(refresh.refreshFailed.value, false)
    assert.match(
      refresh.refreshMessage.value,
      catalogue.length ? /No new portal releases\. Latest: 0\.13\.2/ : /No stable portal releases are available/
    )
  }
})

test('release errors retain the catalogue, hide raw errors, and allow retry', async () => {
  const releases = ref([{ version: '0.13.1' }])
  const previousCatalogue = releases.value
  let shouldFail = true
  let inventoryRefreshes = 0
  const refresh = useInventoryRefresh({
    releases,
    fetchReleases: async () => {
      if (shouldFail) {
        throw new Error('GHCR credentials secret-token')
      }
      return [{ version: '0.13.2' }]
    },
    refreshInstances: async () => {
      inventoryRefreshes++
      return true
    }
  })
  await refresh.refreshInventory()
  assert.equal(releases.value, previousCatalogue)
  assert.equal(inventoryRefreshes, 0)
  assert.equal(refresh.isRefreshingReleases.value, false)
  assert.equal(refresh.refreshFailed.value, true)
  assert.match(refresh.refreshMessage.value, /previous catalogue is unchanged\. Please try again/)
  assert.doesNotMatch(refresh.refreshMessage.value, /GHCR|secret-token/)
  shouldFail = false
  await refresh.refreshInventory()
  assert.equal(refresh.refreshFailed.value, false)
  assert.equal(releases.value[0]?.version, '0.13.2')
  assert.equal(inventoryRefreshes, 1)
})

test('inventory failures report partial success and retain freshly loaded release choices', async () => {
  for (const throws of [false, true]) {
    const releases = ref([{ version: '0.13.1' }])
    const refresh = useInventoryRefresh({
      releases,
      fetchReleases: async () => [{ version: '0.13.2' }],
      refreshInstances: async () => {
        if (throws) {
          throw new Error('Internal inventory details')
        }
        return false
      }
    })
    await refresh.refreshInventory()
    assert.equal(releases.value[0]?.version, '0.13.2')
    assert.equal(refresh.isRefreshingReleases.value, false)
    assert.equal(refresh.refreshFailed.value, true)
    assert.match(refresh.refreshMessage.value, /Releases refreshed.*[Ii]nventory could not be refreshed/)
    assert.doesNotMatch(refresh.refreshMessage.value, /Internal inventory details/)
  }
})
