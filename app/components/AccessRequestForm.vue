<script setup lang="ts">
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'
import { accessRequestInputSchema, type AccessRequestInput } from '~~/shared/access-requests'

const config = useRuntimeConfig()
const state = reactive<AccessRequestInput>({
  name: '',
  email: '',
  organization: '',
  website: '',
  intendedUse: '',
  expectedUsers: '1-10',
  desiredTimeline: 'exploring',
  notes: '',
  preferredSlug: '',
  consent: false,
  termsAccepted: false,
  turnstileToken: '',
  contactCode: ''
})
const expectedUserOptions = [
  { label: '1–10', value: '1-10' },
  { label: '11–50', value: '11-50' },
  { label: '51–200', value: '51-200' },
  { label: '201+', value: '201+' }
]
const timelineOptions = [
  { label: 'Exploring', value: 'exploring' },
  { label: 'Within one month', value: '1-month' },
  { label: 'One to three months', value: '1-3-months' },
  { label: 'More than three months', value: '3-months-plus' }
]
const busy = ref(false)
const submitted = ref(false)
const error = ref('')

watch(
  () => state.organization,
  (value) => {
    if (!state.preferredSlug) {
      state.preferredSlug = value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63)
    }
  }
)

async function submit(event: FormSubmitEvent<AccessRequestInput>) {
  error.value = ''
  busy.value = true
  try {
    const turnstileToken = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value || ''
    await $fetch('/api/access-requests', {
      method: 'POST',
      body: { ...event.data, turnstileToken }
    })
    submitted.value = true
  } catch (cause: unknown) {
    error.value =
      (cause as { data?: { statusMessage?: string } })?.data?.statusMessage ||
      'Your request could not be submitted. Please try again.'
  } finally {
    busy.value = false
  }
}

async function onValidationError(event: FormErrorEvent) {
  const firstError = event.errors[0]
  error.value = firstError?.message || 'Check the highlighted fields and try again.'

  await nextTick()
  if (firstError?.id) {
    document.getElementById(firstError.id)?.focus()
  }
}

onMounted(() => {
  if (config.public.turnstileSiteKey && !document.querySelector('script[data-portalnuxt-turnstile]')) {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    script.dataset.portalnuxtTurnstile = 'true'
    document.head.append(script)
  }
})
</script>

<template>
  <div v-if="submitted" class="request-receipt" role="status">
    <UIcon name="i-lucide-circle-check" class="size-6 shrink-0 text-primary" />
    <div>
      <h3>Request received.</h3>
      <p>
        We sent a receipt to {{ state.email }}. Our team will contact you by email; no PortalNuxt account was created.
      </p>
    </div>
  </div>
  <UForm
    v-else
    class="request-form"
    :schema="accessRequestInputSchema"
    :state="state"
    @submit="submit"
    @error="onValidationError"
  >
    <div class="request-form__grid">
      <UFormField label="Full name" name="name" required>
        <UInput v-model="state.name" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField label="Work email" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField label="Organization" name="organization" required>
        <UInput v-model="state.organization" autocomplete="organization" class="w-full" />
      </UFormField>
      <UFormField label="Website" name="website" hint="Optional">
        <UInput v-model="state.website" type="url" placeholder="https://" class="w-full" />
      </UFormField>
      <UFormField label="Expected users" name="expectedUsers" required>
        <USelect
          v-model="state.expectedUsers"
          :items="expectedUserOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Desired timeline" name="desiredTimeline" required>
        <USelect
          v-model="state.desiredTimeline"
          :items="timelineOptions"
          value-key="value"
          label-key="label"
          class="w-full"
        />
      </UFormField>
      <UFormField class="request-form__wide" label="Intended use" name="intendedUse" required>
        <UTextarea
          v-model="state.intendedUse"
          :rows="5"
          placeholder="What should the portal help your organization do?"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Preferred portal address" name="preferredSlug" hint="Suggested, not reserved">
        <UInput v-model="state.preferredSlug" autocomplete="off" :spellcheck="false" class="w-full">
          <template #trailing>
            <span class="request-form__domain">.{{ config.public.portalBaseDomain || 'portalnuxt.com' }}</span>
          </template>
        </UInput>
      </UFormField>
      <UFormField label="Additional context" name="notes" hint="Optional">
        <UTextarea v-model="state.notes" :rows="3" class="w-full" />
      </UFormField>
    </div>

    <UFormField class="request-form__honeypot" label="Contact code" name="contactCode" aria-hidden="true">
      <UInput v-model="state.contactCode" tabindex="-1" autocomplete="one-time-code" />
    </UFormField>
    <ClientOnly>
      <div v-if="config.public.turnstileSiteKey" class="cf-turnstile" :data-sitekey="config.public.turnstileSiteKey" />
    </ClientOnly>

    <div class="request-form__agreements">
      <UFormField name="consent">
        <UCheckbox v-model="state.consent" label="PortalNuxt may contact me about this access request." />
      </UFormField>
      <UFormField name="termsAccepted">
        <UCheckbox v-model="state.termsAccepted">
          <template #label>
            I agree to the
            <NuxtLink class="request-form__terms-link" to="/terms" target="_blank">Terms of Service</NuxtLink>.
          </template>
        </UCheckbox>
      </UFormField>
    </div>

    <p v-if="error" class="helper helper--error" role="alert">{{ error }}</p>
    <div class="request-form__actions">
      <UButton type="submit" :loading="busy">Send access request</UButton>
    </div>
  </UForm>
</template>
