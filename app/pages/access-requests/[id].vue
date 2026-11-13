<script setup lang="ts">
import type { AccessRequest } from '~~/shared/access-requests'
import type { PortalEnvironmentVariable } from '~~/shared/portal-environment'
import { portalCreateSchema } from '~~/shared/portal-validation'
const route = useRoute()
const { data: request, refresh } = await useFetch<AccessRequest>(`/api/operator/access-requests/${route.params.id}`)
if (!request.value) {
  throw createError({ statusCode: 404, statusMessage: 'Access request not found' })
}
const actionOpen = ref(false),
  action = ref<'approve' | 'decline' | 'start-review' | 'save-notes'>('approve'),
  busy = ref(false),
  operatorNotes = ref(request.value.operatorNotes || ''),
  declineReason = ref(''),
  provisionOpen = ref(false),
  provision = reactive({
    name: request.value.organization,
    slug: request.value.preferredSlug || '',
    adminEmail: request.value.email,
    environmentVariables: [] as PortalEnvironmentVariable[]
  }),
  error = ref('')
function openAction(value: typeof action.value) {
  action.value = value
  actionOpen.value = true
}
async function confirmAction() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/operator/access-requests/${route.params.id}`, {
      method: 'PATCH',
      body: { action: action.value, operatorNotes: operatorNotes.value, declineReason: declineReason.value }
    })
    actionOpen.value = false
    await refresh()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Action failed'
  } finally {
    busy.value = false
  }
}
async function createInstance() {
  const parsed = portalCreateSchema.safeParse(provision)
  if (!parsed.success || busy.value) {
    error.value = 'Review the instance details.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const instance = await $fetch<{ id: string }>(`/api/operator/access-requests/${route.params.id}/provision`, {
      method: 'POST',
      body: parsed.data
    })
    await navigateTo(`/instances/${instance.id}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Provisioning failed'
  } finally {
    busy.value = false
  }
}
useSeoMeta({ title: () => request.value?.organization || 'Access request' })
</script>
<template>
  <section v-if="request" class="operator-band request-detail">
    <header class="section-head">
      <div>
        <NuxtLink class="back-link" to="/access-requests">← Access requests</NuxtLink>
        <p class="eyebrow">{{ request.status }}</p>
        <h1>{{ request.organization }}</h1>
        <p>
          {{ request.name }} · <a :href="`mailto:${request.email}`">{{ request.email }}</a>
        </p>
      </div>
    </header>
    <div class="request-detail__grid">
      <article class="detail-card">
        <h2>Qualification</h2>
        <dl class="detail-list">
          <div>
            <dt>Intended use</dt>
            <dd>{{ request.intendedUse }}</dd>
          </div>
          <div>
            <dt>Expected users</dt>
            <dd>{{ request.expectedUsers }}</dd>
          </div>
          <div>
            <dt>Desired timeline</dt>
            <dd>{{ request.desiredTimeline }}</dd>
          </div>
          <div>
            <dt>Preferred slug</dt>
            <dd>{{ request.preferredSlug || 'Not supplied' }}</dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              <a v-if="request.website" :href="request.website">{{ request.website }}</a
              ><span v-else>Not supplied</span>
            </dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{{ request.notes || 'None' }}</dd>
          </div>
        </dl>
      </article>
      <aside class="detail-card">
        <h2>Operator notes</h2>
        <textarea v-model="operatorNotes" rows="8"></textarea>
        <div class="form__actions">
          <UButton color="neutral" variant="outline" @click="openAction('save-notes')">Save notes</UButton
          ><UButton v-if="request.status === 'NEW'" @click="openAction('start-review')">Start review</UButton
          ><UButton v-if="['NEW', 'REVIEWING'].includes(request.status)" @click="openAction('approve')">Approve</UButton
          ><UButton
            v-if="['NEW', 'REVIEWING', 'APPROVED'].includes(request.status)"
            color="error"
            variant="outline"
            @click="openAction('decline')"
            >Decline</UButton
          ><UButton v-if="request.status === 'APPROVED'" icon="i-lucide-server-cog" @click="provisionOpen = true"
            >Create instance</UButton
          >
        </div>
        <p v-if="error" class="helper helper--error">{{ error }}</p>
      </aside>
    </div>
    <ConfirmationModal
      v-if="actionOpen"
      v-model:is-open="actionOpen"
      :title="`${action.replace('-', ' ')} ${request.organization}?`"
      :description="`Confirm this review action for ${request.name}.`"
      :confirm-label="action === 'decline' ? 'Decline request' : 'Confirm'"
      :confirm-color="action === 'decline' ? 'error' : 'primary'"
      :loading="busy"
      @confirm="confirmAction"
      ><label v-if="action === 'decline'" class="field"
        >Reason included in email <em>Optional</em><textarea v-model="declineReason" rows="4"></textarea></label
    ></ConfirmationModal>
    <UModal
      v-if="provisionOpen"
      v-model:open="provisionOpen"
      title="Create dedicated instance?"
      :description="`Confirm the portal details for ${request.organization}.`"
      :dismissible="!busy"
    >
      <template #body>
        <UForm
          :state="provision"
          :schema="portalCreateSchema"
          novalidate
          class="instance-create-form"
          @submit="createInstance"
        >
          <UFormField label="Instance name" name="name" required>
            <UInput v-model="provision.name" class="w-full" />
          </UFormField>
          <UFormField label="Portal slug" name="slug" required>
            <UInput v-model="provision.slug" class="w-full" autocomplete="off" :spellcheck="false" />
          </UFormField>
          <UFormField label="Tenant administrator" name="adminEmail" required>
            <UInput v-model="provision.adminEmail" type="email" class="w-full" />
          </UFormField>
          <EnvironmentVariableFields v-model="provision.environmentVariables" :disabled="busy" />
          <p v-if="error" class="helper helper--error" role="alert">{{ error }}</p>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="neutral" variant="ghost" :disabled="busy" @click="provisionOpen = false"
              >Cancel</UButton
            >
            <UButton type="submit" :loading="busy">Queue provisioning</UButton>
          </div>
        </UForm>
      </template>
    </UModal>
  </section>
</template>
