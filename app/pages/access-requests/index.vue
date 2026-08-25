<script setup lang="ts">
import type { AccessRequestListResponse, AccessRequestStatus } from '~~/shared/access-requests'
const route = useRoute(),
  router = useRouter(),
  requestFetch = useRequestFetch()
const search = ref(String(route.query.search || '')),
  status = ref(String(route.query.status || 'all')),
  sort = ref(String(route.query.sort || 'createdAt')),
  direction = ref(route.query.direction === 'asc' ? 'asc' : 'desc'),
  page = ref(Math.max(1, Number(route.query.page) || 1)),
  loading = ref(false),
  error = ref(''),
  result = ref<AccessRequestListResponse>({
    items: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1, hasNext: false }
  })
const statuses = ['NEW', 'REVIEWING', 'APPROVED', 'DECLINED', 'PROVISIONING', 'PROVISIONED'] as AccessRequestStatus[]
const sortOptions = [
  { label: 'Created', value: 'createdAt' },
  { label: 'Updated', value: 'updatedAt' },
  { label: 'Organization', value: 'organization' },
  { label: 'Status', value: 'status' }
]
const selectedSortLabel = computed(() => sortOptions.find((option) => option.value === sort.value)?.label ?? 'Created')
const sortMenuItems = computed(() => [
  sortOptions.map((option) => ({
    label: option.label,
    icon: sort.value === option.value ? 'i-lucide-check' : undefined,
    onSelect: () => {
      sort.value = option.value
    }
  }))
])
async function load() {
  loading.value = true
  error.value = ''
  try {
    result.value = await requestFetch('/api/operator/access-requests', {
      query: {
        search: search.value || undefined,
        status: status.value === 'all' ? undefined : status.value,
        sort: sort.value,
        direction: direction.value,
        page: page.value
      }
    })
  } catch {
    error.value = 'Access requests could not be loaded.'
  } finally {
    loading.value = false
  }
}
let timer: ReturnType<typeof setTimeout>
watch([search, status, sort, direction], () => {
  page.value = 1
  clearTimeout(timer)
  timer = setTimeout(sync, 250)
})
watch(page, sync)
async function sync() {
  await router.replace({
    query: {
      ...(search.value ? { search: search.value } : {}),
      ...(status.value !== 'all' ? { status: status.value } : {}),
      ...(sort.value !== 'createdAt' ? { sort: sort.value } : {}),
      ...(direction.value !== 'desc' ? { direction: direction.value } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {})
    }
  })
  await load()
}
await load()
useSeoMeta({ title: 'Access requests' })
</script>
<template>
  <div class="operator-page">
    <section class="operator-band operator-band--compact">
      <header class="section-head operator-section-head">
        <div class="operator-section-title">
          <UIcon class="operator-section-title__icon" name="i-lucide-inbox" aria-hidden="true" />
          <h1>Access requests</h1>
        </div>
      </header>
      <div class="operator-controls" aria-label="Access request controls">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search requests"
          aria-label="Search requests"
          :loading="loading"
          clearable
          class="min-w-0 flex-1 md:max-w-xs"
        /><USelect
          v-model="status"
          :items="[
            { label: 'All statuses', value: 'all' },
            ...statuses.map((value) => ({ label: value.replace('-', ' '), value }))
          ]"
          value-key="value"
          label-key="label"
          aria-label="Filter by status"
          class="w-44"
        />
        <UDropdownMenu :items="sortMenuItems" :content="{ align: 'end' }">
          <UButton
            variant="outline"
            icon="i-lucide-arrow-down-up"
            class="ml-auto w-44 justify-between"
            aria-label="Sort requests"
          >
            <span class="truncate">{{ selectedSortLabel }}</span>
            <UIcon name="i-lucide-chevron-down" class="size-4 opacity-60" />
          </UButton>
        </UDropdownMenu>
        <UButton
          color="neutral"
          variant="outline"
          :icon="direction === 'asc' ? 'i-lucide-arrow-up-narrow-wide' : 'i-lucide-arrow-down-wide-narrow'"
          :aria-label="direction === 'asc' ? 'Ascending' : 'Descending'"
          @click="direction = direction === 'asc' ? 'desc' : 'asc'"
        />
      </div>
      <div class="operator-results-summary" aria-live="polite">
        <span>{{ result.pagination.totalItems }} request{{ result.pagination.totalItems === 1 ? '' : 's' }}</span>
        <span v-if="search || status !== 'all'">Filtered results</span>
      </div>
      <p v-if="error" class="operator-list-message">{{ error }}</p>
      <div v-else-if="result.items.length" class="request-list">
        <NuxtLink v-for="item in result.items" :key="item.id" class="request-card" :to="`/access-requests/${item.id}`"
          ><div>
            <span class="status-label">{{ item.status }}</span>
            <h2>{{ item.organization }}</h2>
            <p>{{ item.name }} · {{ item.email }}</p>
            <p class="helper request-card__use">{{ item.intendedUse }}</p>
          </div>
          <dl>
            <div>
              <dt>Users</dt>
              <dd>{{ item.expectedUsers }}</dd>
            </div>
            <div>
              <dt>Timeline</dt>
              <dd>{{ item.desiredTimeline }}</dd>
            </div>
            <div>
              <dt>Requested</dt>
              <dd>{{ new Date(item.createdAt).toLocaleDateString() }}</dd>
            </div>
          </dl>
          <UIcon name="i-lucide-chevron-right" aria-hidden="true" />
        </NuxtLink>
      </div>
      <div v-else-if="!loading" class="operator-empty-state">
        <UIcon name="i-lucide-inbox" />
        <h3>No access requests found</h3>
        <p>Try changing your search or status filter.</p>
      </div>
      <div v-if="loading" class="operator-list-loading" role="status">
        <UIcon name="i-lucide-loader-circle" />
        <span>Loading access requests…</span>
      </div>
      <div v-if="result.pagination.totalPages > 1" class="pagination">
        <UButton color="neutral" variant="outline" :disabled="page <= 1" @click="page--">Previous</UButton
        ><span>Page {{ result.pagination.page }} of {{ result.pagination.totalPages }}</span
        ><UButton color="neutral" variant="outline" :disabled="!result.pagination.hasNext" @click="page++"
          >Next</UButton
        >
      </div>
    </section>
  </div>
</template>
