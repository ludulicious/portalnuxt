<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PortalInstance } from '~~/shared/control-plane'
import { portalCreateSchema } from '~~/shared/portal-validation'
import { isReleaseTransitionAllowed } from '~~/shared/release-policy'
interface PortalRelease {
  version: string
  image: string
  discoveredAt: string
}
interface InstanceListResponse {
  items: PortalInstance[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNext: boolean
  }
}
type InstanceSort = 'name' | 'createdAt' | 'status' | 'version'
type SortDirection = 'asc' | 'desc'
const filterStatuses = ['ACTIVE', 'PROVISIONING', 'QUEUED', 'ERROR', 'SUSPENDED', 'DELETION_SCHEDULED'] as const

const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()
const instances = ref<PortalInstance[]>([])
const listPending = ref(false)
const listError = ref('')
const loadMoreSentinel = ref<HTMLElement | null>(null)
const pagination = reactive({ page: 1, pageSize: 20, totalItems: 0, totalPages: 1, hasNext: false })
const search = ref(typeof route.query.search === 'string' ? route.query.search : '')
const showFilters = ref(false)
const showSort = ref(false)
const isMobile = ref(false)
const status = ref(
  typeof route.query.status === 'string' &&
    filterStatuses.includes(route.query.status as (typeof filterStatuses)[number])
    ? route.query.status
    : 'all'
)
const version = ref(typeof route.query.version === 'string' ? route.query.version : 'all')
const sort = ref<InstanceSort>(
  typeof route.query.sort === 'string' && ['name', 'createdAt', 'status', 'version'].includes(route.query.sort)
    ? (route.query.sort as InstanceSort)
    : 'createdAt'
)
const direction = ref<SortDirection>(route.query.direction === 'asc' ? 'asc' : 'desc')
const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Provisioning', value: 'PROVISIONING' },
  { label: 'Queued', value: 'QUEUED' },
  { label: 'Errors', value: 'ERROR' },
  { label: 'Suspended', value: 'SUSPENDED' },
  { label: 'Deletion scheduled', value: 'DELETION_SCHEDULED' }
]
const sortOptions = [
  { label: 'Created', value: 'createdAt' },
  { label: 'Name', value: 'name' },
  { label: 'Status', value: 'status' },
  { label: 'Deployed version', value: 'version' }
]
const { data: releases, refresh: refreshReleases } = await useFetch<PortalRelease[]>('/api/operator/releases')
const busy = ref('')
const createDialogOpen = ref(false)
const createBusy = ref(false)
const createError = ref('')
const createForm = reactive({ name: '', slug: '', adminEmail: '' })
const isRefreshingReleases = ref(false)
const deploymentDialogOpen = ref(false)
const deploymentTarget = ref<PortalInstance | null>(null)
const deploymentVersion = ref('')
const actionDialogOpen = ref(false)
const actionTarget = ref<PortalInstance | null>(null)
const pendingAction = ref<'suspend' | 'schedule-deletion' | null>(null)
const deleteConfirmationSlug = ref('')
const deploymentSteps = ['APPLICATION', 'ENVIRONMENT', 'DEPLOYMENT', 'HEALTH', 'COMPLETE'] as const
const latest = computed(() => releases.value?.[0]?.version ?? '')
const releaseOptions = computed(
  () =>
    releases.value?.map((release) => ({
      label: `${release.version}${release.version === latest.value ? ' (latest)' : ''}`,
      value: release.version
    })) ?? []
)
const versionFilterOptions = computed(() => [
  { label: 'All versions', value: 'all' },
  ...(releases.value?.map((release) => ({ label: release.version, value: release.version })) ?? [])
])
const deploymentReleaseOptions = computed(() => {
  const deployedVersion = deploymentTarget.value?.deployedVersion ?? null
  const availableVersions = releases.value?.map((release) => release.version) ?? []
  return releaseOptions.value.filter((option) =>
    isReleaseTransitionAllowed(deployedVersion, option.value, availableVersions)
  )
})
const actionDialogTitle = computed(() => {
  if (!actionTarget.value) {
    return ''
  }
  return pendingAction.value === 'suspend'
    ? `Suspend ${actionTarget.value.name}?`
    : `Schedule deletion for ${actionTarget.value.name}?`
})
const actionDialogDescription = computed(() =>
  pendingAction.value === 'suspend'
    ? 'The portal will become unavailable until it is resumed.'
    : 'This schedules the portal and its infrastructure for deletion. This action is destructive.'
)
const actionConfirmDisabled = computed(
  () =>
    !actionTarget.value ||
    !pendingAction.value ||
    (pendingAction.value === 'schedule-deletion' && deleteConfirmationSlug.value !== actionTarget.value.slug)
)
const selectedSortLabel = computed(() => sortOptions.find((option) => option.value === sort.value)?.label ?? '')
const createDisabled = computed(() => !portalCreateSchema.safeParse(createForm).success)
const sortMenuItems = computed(() => [
  sortOptions.map((option) => ({
    label: option.label,
    icon: sort.value === option.value ? 'i-lucide-check' : undefined,
    onSelect: () => {
      sort.value = option.value as InstanceSort
    }
  }))
])
function toggleSortDirection() {
  direction.value = direction.value === 'asc' ? 'desc' : 'asc'
}
function openCreateDialog() {
  Object.assign(createForm, { name: '', slug: '', adminEmail: '' })
  createError.value = ''
  createDialogOpen.value = true
}
async function createInstance() {
  const parsed = portalCreateSchema.safeParse(createForm)
  if (!parsed.success || createBusy.value) {
    return
  }
  createBusy.value = true
  createError.value = ''
  try {
    await $fetch('/api/instances', { method: 'POST', body: parsed.data })
    createDialogOpen.value = false
    await loadInstances(1, true)
  } catch (error: unknown) {
    createError.value =
      (error as { data?: { statusMessage?: string }; statusMessage?: string }).data?.statusMessage ||
      (error as { statusMessage?: string }).statusMessage ||
      'The instance could not be created.'
  } finally {
    createBusy.value = false
  }
}
function pageFromQuery() {
  const value = Number(route.query.page)
  return Number.isInteger(value) && value > 0 ? value : 1
}
function collectionQuery(page: number) {
  return {
    ...(search.value.trim() ? { search: search.value.trim() } : {}),
    ...(status.value !== 'all' ? { status: status.value } : {}),
    ...(version.value !== 'all' ? { version: version.value } : {}),
    ...(sort.value !== 'createdAt' ? { sort: sort.value } : {}),
    ...(direction.value !== 'desc' ? { direction: direction.value } : {}),
    ...(page > 1 ? { page: String(page) } : {})
  }
}
function requestQuery(page: number) {
  return {
    page,
    pageSize: pagination.pageSize,
    search: search.value.trim() || undefined,
    status: status.value === 'all' ? undefined : status.value,
    version: version.value === 'all' ? undefined : version.value,
    sort: sort.value,
    direction: direction.value
  }
}
function instanceListUrl(page: number) {
  const parameters = new URLSearchParams()
  for (const [key, value] of Object.entries(requestQuery(page))) {
    if (value !== undefined) {
      parameters.set(key, String(value))
    }
  }
  return `/api/operator/instances?${parameters.toString()}`
}
async function loadInstances(page: number, replace: boolean) {
  if (listPending.value) {
    return
  }
  listPending.value = true
  listError.value = ''
  try {
    const result = await requestFetch<InstanceListResponse>(instanceListUrl(page))
    const incoming = replace ? result.items : [...instances.value, ...result.items]
    instances.value = [...new Map(incoming.map((instance) => [instance.id, instance])).values()]
    Object.assign(pagination, result.pagination)
  } catch {
    listError.value = 'The infrastructure inventory could not be loaded.'
  } finally {
    listPending.value = false
  }
}
let skipNextRouteLoad = false
async function loadNextPage() {
  if (!pagination.hasNext || listPending.value) {
    return
  }
  const nextPage = pagination.page + 1
  await loadInstances(nextPage, false)
  skipNextRouteLoad = true
  await router.replace({ query: collectionQuery(nextPage) })
}
async function goToPage(page: number) {
  if (page === pagination.page || listPending.value) {
    return
  }
  await loadInstances(page, true)
  skipNextRouteLoad = true
  await router.replace({ query: collectionQuery(page) })
}
async function refreshInstances() {
  await loadInstances(1, true)
  if (pageFromQuery() !== 1) {
    skipNextRouteLoad = true
    await router.replace({ query: collectionQuery(1) })
  }
}
function portalUrl(domain: string) {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`
}
function isDeploying(instance: PortalInstance) {
  return ['QUEUED', 'PROVISIONING'].includes(instance.status)
}
function progress(instance: PortalInstance) {
  const index = deploymentSteps.indexOf(instance.step as (typeof deploymentSteps)[number])
  return index < 0
    ? 0
    : Math.round(((index + (instance.step === 'COMPLETE' ? 1 : 0.35)) / deploymentSteps.length) * 100)
}
function progressLabel(instance: PortalInstance) {
  if (instance.status === 'ERROR') {
    return instance.sanitizedError || 'Deployment failed'
  }
  if (instance.step === 'APPLICATION') {
    return 'Updating the Coolify application image'
  }
  if (instance.step === 'ENVIRONMENT') {
    return 'Applying portal configuration'
  }
  if (instance.step === 'DEPLOYMENT') {
    return instance.coolifyDeploymentUuid
      ? 'Coolify is building and starting the release'
      : 'Starting the Coolify deployment'
  }
  if (instance.step === 'HEALTH') {
    return 'Waiting for the portal health check'
  }
  return instance.status === 'ACTIVE' ? 'Deployment completed' : 'Queued for deployment'
}
async function action(instance: PortalInstance, value: 'suspend' | 'schedule-deletion') {
  busy.value = instance.id
  try {
    await $fetch(`/api/operator/instances/${instance.id}`, { method: 'PATCH', body: { action: value } })
    await refreshInstances()
  } finally {
    busy.value = ''
  }
}
function openActionDialog(instance: PortalInstance, value: 'suspend' | 'schedule-deletion') {
  actionTarget.value = instance
  pendingAction.value = value
  deleteConfirmationSlug.value = ''
  actionDialogOpen.value = true
}
async function confirmInstanceAction() {
  const instance = actionTarget.value
  const value = pendingAction.value
  if (!instance || !value || actionConfirmDisabled.value) {
    return
  }

  await action(instance, value)
  actionDialogOpen.value = false
}
function instanceActionItems(instance: PortalInstance): DropdownMenuItem[] {
  return [
    {
      label: 'Suspend',
      icon: 'i-lucide-pause',
      disabled: instance.status === 'SUSPENDED',
      onSelect: () => openActionDialog(instance, 'suspend')
    },
    {
      label: 'Schedule deletion',
      icon: 'i-lucide-calendar-x',
      color: 'error',
      disabled: instance.status === 'DELETION_SCHEDULED',
      onSelect: () => openActionDialog(instance, 'schedule-deletion')
    }
  ]
}
function openDeploymentDialog(instance: PortalInstance) {
  deploymentTarget.value = instance
  deploymentVersion.value = deploymentReleaseOptions.value[0]?.value ?? ''
  deploymentDialogOpen.value = true
}
async function deploy() {
  const instance = deploymentTarget.value
  if (!instance || !deploymentVersion.value) {
    return
  }
  busy.value = instance.id
  try {
    await $fetch(`/api/operator/instances/${instance.id}`, {
      method: 'PATCH',
      body: { action: 'upgrade', version: deploymentVersion.value }
    })
    await refreshInstances()
    deploymentDialogOpen.value = false
  } finally {
    busy.value = ''
  }
}
async function refreshInventory() {
  isRefreshingReleases.value = true
  try {
    await $fetch('/api/operator/releases', { query: { refresh: 'true' } })
    await Promise.all([refreshReleases(), refreshInstances()])
  } finally {
    isRefreshingReleases.value = false
  }
}
let collectionQueryTimer: ReturnType<typeof setTimeout> | undefined
let syncingControlsFromRoute = false
watch([search, status, version, sort, direction], () => {
  if (syncingControlsFromRoute) {
    return
  }
  clearTimeout(collectionQueryTimer)
  collectionQueryTimer = setTimeout(() => {
    void router.replace({ query: collectionQuery(1) })
  }, 250)
})
watch(
  () => route.query,
  async (query) => {
    if (skipNextRouteLoad) {
      skipNextRouteLoad = false
      return
    }
    syncingControlsFromRoute = true
    search.value = typeof query.search === 'string' ? query.search : ''
    status.value =
      typeof query.status === 'string' && filterStatuses.includes(query.status as (typeof filterStatuses)[number])
        ? query.status
        : 'all'
    version.value = typeof query.version === 'string' ? query.version : 'all'
    sort.value =
      typeof query.sort === 'string' && ['name', 'createdAt', 'status', 'version'].includes(query.sort)
        ? (query.sort as InstanceSort)
        : 'createdAt'
    direction.value = query.direction === 'asc' ? 'asc' : 'desc'
    await nextTick()
    syncingControlsFromRoute = false
    await loadInstances(pageFromQuery(), true)
  },
  { deep: true }
)

await loadInstances(pageFromQuery(), true)

let poller: ReturnType<typeof setInterval> | undefined
let listObserver: IntersectionObserver | undefined
let mobileMediaQuery: MediaQueryList | undefined
function updateMobileState(event: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = event.matches
}
onMounted(() => {
  mobileMediaQuery = window.matchMedia('(max-width: 47.999rem)')
  updateMobileState(mobileMediaQuery)
  mobileMediaQuery.addEventListener('change', updateMobileState)
  listObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadNextPage()
      }
    },
    { rootMargin: '320px 0px' }
  )
  if (loadMoreSentinel.value) {
    listObserver.observe(loadMoreSentinel.value)
  }
  poller = setInterval(() => {
    if (pagination.page === 1 && instances.value.some(isDeploying)) {
      void loadInstances(1, true)
    }
  }, 3000)
})
watch(loadMoreSentinel, (element, previous) => {
  if (previous) {
    listObserver?.unobserve(previous)
  }
  if (element) {
    listObserver?.observe(element)
  }
})
onBeforeUnmount(() => {
  clearInterval(poller)
  clearTimeout(collectionQueryTimer)
  listObserver?.disconnect()
  mobileMediaQuery?.removeEventListener('change', updateMobileState)
})
</script>
<template>
  <div class="operator-page">
    <section class="operator-band operator-band--compact">
      <header class="section-head operator-section-head">
        <div>
          <div class="operator-section-title">
            <UIcon class="operator-section-title__icon" name="i-lucide-server" aria-hidden="true" />
            <h1>Instances</h1>
          </div>
        </div>
        <div class="operator-header-actions">
          <UButton icon="i-lucide-plus" label="Add instance" @click="openCreateDialog" />
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-refresh-cw" class="operator-refresh"
            :loading="isRefreshingReleases" :disabled="isRefreshingReleases" aria-label="Refresh inventory"
            @click="refreshInventory" />
        </div>
        <span class="sr-only" aria-live="polite">{{
          isRefreshingReleases ? 'Refreshing portal inventory and releases' : ''
        }}</span>
      </header>
      <div class="operator-controls" aria-label="Inventory controls">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search portals" aria-label="Search portals"
          :loading="listPending" clearable class="min-w-0 flex-1 md:max-w-xs" />
        <template v-if="!isMobile">
          <USelect v-model="status" :items="statusOptions" value-key="value" label-key="label"
            aria-label="Filter by status" class="w-44" />
          <USelect v-model="version" :items="versionFilterOptions" value-key="value" label-key="label"
            aria-label="Filter by deployed version" class="w-40" />
          <UDropdownMenu :items="sortMenuItems" :content="{ align: 'end' }">
            <UButton variant="outline" icon="i-lucide-arrow-down-up" class="ml-auto w-44 justify-between">
              <span class="truncate">{{ selectedSortLabel }}</span>
              <UIcon name="i-lucide-chevron-down" class="size-4 opacity-60" />
            </UButton>
          </UDropdownMenu>
          <UButton variant="outline"
            :icon="direction === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow'"
            :aria-label="direction === 'asc' ? 'Ascending' : 'Descending'" @click="toggleSortDirection" />
        </template>
        <template v-else>
          <UButton variant="outline" icon="i-lucide-filter" aria-label="Filters" @click="showFilters = true" />
          <UButton variant="outline" icon="i-lucide-arrow-down-up" aria-label="Sort" @click="showSort = true" />
        </template>
      </div>
      <UModal v-model:open="showFilters" title="Filters">
        <template #body>
          <div class="operator-mobile-filters">
            <UFormField label="Status">
              <USelect v-model="status" :items="statusOptions" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Deployed version">
              <USelect v-model="version" :items="versionFilterOptions" value-key="value" label-key="label"
                class="w-full" />
            </UFormField>
          </div>
        </template>
      </UModal>
      <UModal v-model:open="showSort" title="Sort">
        <template #body>
          <div class="operator-mobile-sort">
            <UFormField label="Sort by">
              <USelect v-model="sort" :items="sortOptions" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UButton block variant="outline"
              :icon="direction === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow'"
              @click="toggleSortDirection">
              {{ direction === 'asc' ? 'Ascending' : 'Descending' }}
            </UButton>
          </div>
        </template>
      </UModal>
      <div class="operator-results-summary" aria-live="polite">
        <span>{{ pagination.totalItems }} {{ pagination.totalItems === 1 ? 'portal' : 'portals' }}</span>
        <span v-if="search || status !== 'all' || version !== 'all'">Filtered results</span>
      </div>
      <p v-if="listError" class="operator-list-message">{{ listError }}</p>
      <p v-else-if="!releases?.length" class="operator-list-message">No stable portal releases have been discovered.</p>
      <div v-else-if="instances.length" class="operator-grid">
        <article v-for="instance in instances" :key="instance.id" class="operator-item">
          <div class="operator-item__meta">
            <span>{{ instance.status }}</span><span>{{ instance.step }}</span>
          </div>
          <h3>{{ instance.name }}</h3>
          <p>
            <a class="operator-item__domain" :href="portalUrl(instance.domain)" target="_blank"
              rel="noopener noreferrer">
              {{ instance.domain }}
              <UIcon name="i-lucide-external-link" />
            </a>
          </p>
          <p class="release-status">
            <span>Deployed: <strong>{{ instance.deployedVersion || 'Unknown legacy release' }}</strong></span>
            <span v-if="latest && instance.deployedVersion !== latest" class="release-update-available">
              <UIcon name="i-lucide-arrow-up-circle" />
              <strong>Update available</strong>
              <span>Version {{ latest }}</span>
            </span>
            <span v-else-if="latest" class="release-current">
              <UIcon name="i-lucide-circle-check" /> Latest release
            </span>
          </p>
          <div v-if="isDeploying(instance) || instance.status === 'ERROR'" class="deployment-progress"
            :data-state="instance.status === 'ERROR' ? 'error' : 'running'" aria-live="polite">
            <div class="deployment-progress__header">
              <span>
                <UIcon v-if="isDeploying(instance)" name="i-lucide-loader-circle"
                  class="deployment-progress__spinner" />{{
                    progressLabel(instance) }}
              </span><strong>{{ instance.status === 'ERROR' ? 'Failed' : `${progress(instance)}%` }}</strong>
            </div>
            <UProgress :model-value="instance.status === 'ERROR' ? 100 : progress(instance)"
              :color="instance.status === 'ERROR' ? 'error' : 'primary'" size="sm" />
            <div class="deployment-progress__steps">
              <span v-for="step in deploymentSteps" :key="step" :data-active="step === instance.step">{{
                step === 'ENVIRONMENT' ? 'Config' : step.charAt(0) + step.slice(1).toLowerCase()
              }}</span>
            </div>
          </div>
          <div class="form__actions operator-item__actions">
            <UButton color="primary" variant="outline" :loading="busy === instance.id || isDeploying(instance)"
              :disabled="!releaseOptions.length || isDeploying(instance)" @click="openDeploymentDialog(instance)">{{
                isDeploying(instance)
                  ? 'Deploying…'
                  : latest === instance.deployedVersion
                    ? 'Redeploy'
                    : 'Deploy release'
              }}</UButton>
            <div class="operator-item__more-actions">
              <UDropdownMenu :items="instanceActionItems(instance)" :content="{ align: 'end' }">
                <UButton color="neutral" variant="outline" icon="i-lucide-ellipsis-vertical"
                  aria-label="More instance actions" :disabled="busy === instance.id || isDeploying(instance)" />
              </UDropdownMenu>
            </div>
          </div>
        </article>
      </div>
      <div v-else-if="!listPending" class="operator-empty-state">
        <UIcon name="i-lucide-server-off" />
        <h3>No portals found</h3>
        <p>Try changing your search or status filter.</p>
      </div>
      <div ref="loadMoreSentinel" class="operator-list-sentinel" aria-hidden="true"></div>
      <div v-if="listPending" class="operator-list-loading" role="status">
        <UIcon name="i-lucide-loader-circle" />
        <span>{{ instances.length ? 'Loading more portals…' : 'Loading portals…' }}</span>
      </div>
      <UButton v-else-if="pagination.hasNext" color="neutral" variant="ghost" class="operator-load-more"
        @click="loadNextPage">
        Load more
      </UButton>
      <UPagination v-if="pagination.totalPages > 1" :page="pagination.page" :items-per-page="pagination.pageSize"
        :total="pagination.totalItems" class="operator-pagination" aria-label="Inventory pages"
        @update:page="goToPage" />
    </section>
    <ConfirmationModal v-if="createDialogOpen" v-model:is-open="createDialogOpen" title="Provision a new instance"
      description="Enter the portal details. Provisioning starts after confirmation." confirm-label="Provision instance"
      :loading="createBusy" :confirm-disabled="createDisabled" @confirm="createInstance">
      <div class="instance-create-form">
        <UFormField label="Instance name" name="name" required>
          <UInput v-model="createForm.name" class="w-full" autocomplete="organization" />
        </UFormField>
        <UFormField label="Portal slug" name="slug" required>
          <UInput v-model="createForm.slug" class="w-full" placeholder="example-company" autocomplete="off"
            :spellcheck="false" />
        </UFormField>
        <UFormField label="Tenant administrator" name="adminEmail" required>
          <UInput v-model="createForm.adminEmail" class="w-full" type="email" autocomplete="email" />
        </UFormField>
        <p v-if="latest" class="helper">Release {{ latest }} will be provisioned.</p>
        <p v-if="createError" class="helper helper--error" role="alert">{{ createError }}</p>
      </div>
    </ConfirmationModal>
    <ConfirmationModal v-if="deploymentTarget" v-model:is-open="deploymentDialogOpen"
      :title="`Deploy release to ${deploymentTarget.name}`"
      description="Choose the portal version to deploy. Deployment starts after confirmation."
      confirm-label="Confirm deployment" :loading="busy === deploymentTarget.id" :confirm-disabled="!deploymentVersion"
      @confirm="deploy">
      <div class="deployment-confirmation">
        <p>
          Current version:
          <strong>{{ deploymentTarget.deployedVersion || 'Unknown legacy release' }}</strong>
        </p>
        <div class="field">
          <label for="deployment-release">Release</label>
          <USelect id="deployment-release" v-model="deploymentVersion" :items="deploymentReleaseOptions"
            value-key="value" label-key="label" placeholder="Select a release" class="w-full" />
        </div>
      </div>
    </ConfirmationModal>
    <ConfirmationModal v-if="actionTarget && pendingAction" v-model:is-open="actionDialogOpen"
      :title="actionDialogTitle" :description="actionDialogDescription"
      :confirm-label="pendingAction === 'suspend' ? 'Suspend portal' : 'Schedule deletion'"
      :confirm-color="pendingAction === 'schedule-deletion' ? 'error' : 'primary'" :loading="busy === actionTarget.id"
      :confirm-disabled="actionConfirmDisabled" @confirm="confirmInstanceAction">
      <div class="action-confirmation">
        <p>
          Portal: <strong>{{ actionTarget.domain }}</strong>
        </p>
        <div v-if="pendingAction === 'schedule-deletion'" class="field">
          <label for="delete-confirmation-slug">
            Type <strong>{{ actionTarget.slug }}</strong> to confirm
          </label>
          <UInput id="delete-confirmation-slug" v-model="deleteConfirmationSlug" :placeholder="actionTarget.slug"
            autocomplete="off" :spellcheck="false" class="w-full" />
        </div>
      </div>
    </ConfirmationModal>
  </div>
</template>
