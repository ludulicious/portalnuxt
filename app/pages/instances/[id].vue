<script setup lang="ts">
import type { PortalInstance, ProvisioningStep } from '../../../shared/control-plane'
const route = useRoute()
const { data: instance, refresh } = await useFetch<PortalInstance>(`/api/instances/${route.params.id}`)
const retrying = ref(false)
const steps: Array<{ id: ProvisioningStep; label: string; description: string }> = [
  { id: 'DATABASE', label: 'Database', description: 'Create an isolated role and database.' },
  { id: 'SECRETS', label: 'Secrets', description: 'Generate a unique authentication secret.' },
  { id: 'APPLICATION', label: 'Application', description: 'Register the pinned portal image in Coolify.' },
  { id: 'ENVIRONMENT', label: 'Configuration', description: 'Supply ordinary portal environment variables.' },
  { id: 'DEPLOYMENT', label: 'Deployment', description: 'Start the immutable portal release.' },
  { id: 'HEALTH', label: 'Health', description: 'Wait for the portal health endpoint.' }
]
const activeIndex = computed(() => steps.findIndex((step) => step.id === instance.value?.step))
const failedIndex = computed(() => {
  if (instance.value?.status !== 'ERROR') {
    return -1
  }
  if (instance.value.sanitizedError?.toLowerCase().includes('deployment failed')) {
    return steps.findIndex((step) => step.id === 'DEPLOYMENT')
  }
  return activeIndex.value
})
function stepState(index: number) {
  if (instance.value?.status === 'ACTIVE') {
    return 'complete'
  }
  if (failedIndex.value >= 0) {
    if (index === failedIndex.value) {
      return 'error'
    }
    return index < failedIndex.value ? 'complete' : 'pending'
  }
  if (index < activeIndex.value) {
    return 'complete'
  }
  if (index === activeIndex.value) {
    return 'active'
  }
  return 'pending'
}
function stepStatusLabel(index: number) {
  const state = stepState(index)
  if (state === 'complete') {
    return 'Completed'
  }
  if (state === 'error') {
    return 'Failed'
  }
  if (state === 'active') {
    return 'Running'
  }
  return 'Pending'
}
async function retry() {
  retrying.value = true
  await $fetch(`/api/instances/${route.params.id}/retry`, { method: 'POST' })
  await refresh()
  retrying.value = false
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (instance.value && !['ACTIVE', 'SUSPENDED', 'DELETION_SCHEDULED'].includes(instance.value.status)) {
      refresh()
    }
  }, 5000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>
<template>
  <section v-if="instance" class="steps-section">
    <header class="section-head">
      <div>
        <p class="eyebrow">{{ instance.status }}</p>
        <h2>{{ instance.name }}</h2>
      </div>
      <a v-if="instance.status === 'ACTIVE'" class="btn btn--primary" :href="`https://${instance.domain}`"
        >Open portal</a
      >
    </header>
    <p class="lede">{{ instance.domain }}</p>
    <ol class="steps">
      <li v-for="(step, index) in steps" :key="step.id" class="step" :data-state="stepState(index)">
        <span class="step__number"
          ><span v-if="stepState(index) === 'active'" class="step__spinner" aria-hidden="true" /><span
            v-else
            aria-hidden="true"
            >{{
              stepState(index) === 'complete'
                ? '✓'
                : stepState(index) === 'error'
                  ? '×'
                  : String(index + 1).padStart(2, '0')
            }}</span
          ><span class="sr-only">{{ stepStatusLabel(index) }}</span></span
        >
        <div class="step__body">
          <h3>{{ step.label }}</h3>
          <p>{{ step.description }}</p>
        </div>
      </li>
    </ol>
    <div v-if="instance.status === 'ERROR'" class="workbench">
      <div class="workbench__body form">
        <p class="helper helper--error" role="alert">{{ instance.sanitizedError }}</p>
        <button class="btn btn--primary" :disabled="retrying" @click="retry">
          {{ retrying ? 'Queuing…' : 'Retry provisioning' }}
        </button>
      </div>
    </div>
  </section>
</template>
