import { ref, type Ref } from 'vue'

export function useInventoryRefresh<Release extends { version: string }>(options: {
  releases: Ref<Release[] | null | undefined>
  fetchReleases: () => Promise<Release[]>
  refreshInstances: () => Promise<boolean>
}) {
  const isRefreshingReleases = ref(false)
  const refreshMessage = ref('')
  const refreshFailed = ref(false)

  async function refreshInventory() {
    if (isRefreshingReleases.value) {
      return
    }
    isRefreshingReleases.value = true
    refreshMessage.value = ''
    refreshFailed.value = false
    let releasesUpdated = false
    try {
      const previousVersions = new Set(options.releases.value?.map((release) => release.version))
      const catalogue = await options.fetchReleases()
      options.releases.value = catalogue
      releasesUpdated = true
      const latest = catalogue[0]?.version
      const releaseSummary = latest
        ? `${catalogue.some((release) => !previousVersions.has(release.version)) ? 'New portal releases found.' : 'No new portal releases.'} Latest: ${latest}.`
        : 'No stable portal releases are available.'
      if (!(await options.refreshInstances())) {
        refreshFailed.value = true
        refreshMessage.value = `Releases refreshed. ${releaseSummary} Inventory could not be refreshed. Please try again.`
        return
      }
      refreshMessage.value = `Inventory refreshed. ${releaseSummary}`
    } catch {
      refreshFailed.value = true
      refreshMessage.value = releasesUpdated
        ? 'Releases refreshed, but inventory could not be refreshed. Please try again.'
        : 'Portal releases could not be refreshed. The previous catalogue is unchanged. Please try again.'
    } finally {
      isRefreshingReleases.value = false
    }
  }

  return { isRefreshingReleases, refreshMessage, refreshFailed, refreshInventory }
}
