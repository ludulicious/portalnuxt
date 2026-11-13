<script setup lang="ts">
import type { PortalEnvironmentVariable } from '~~/shared/portal-environment'

defineProps<{ disabled?: boolean }>()
const variables = defineModel<PortalEnvironmentVariable[]>({ required: true })

function addVariable() {
  variables.value = [...variables.value, { name: '', value: '' }]
}

function removeVariable(index: number) {
  variables.value = variables.value.filter((_, position) => position !== index)
}
</script>

<template>
  <UFormField label="Extra environment variables (optional)" name="environmentVariables">
    <div class="space-y-3">
      <p class="helper">
        Applied before first startup. Values are stored encrypted and are not shown again. PortalNuxt manages database,
        domain, authentication, and email settings.
      </p>
      <div v-for="(variable, index) in variables" :key="index" class="space-y-2 rounded border border-default p-3">
        <UFormField label="Name" :name="`environmentVariables.${index}.name`">
          <UInput
            v-model="variable.name"
            placeholder="NUXT_PORTAL_DEMO_ENABLED"
            autocomplete="off"
            :spellcheck="false"
            :disabled="disabled"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Value" :name="`environmentVariables.${index}.value`">
          <UTextarea
            v-model="variable.value"
            :rows="2"
            placeholder="true"
            autocomplete="off"
            :spellcheck="false"
            :disabled="disabled"
            class="w-full"
          />
        </UFormField>
        <UButton type="button" color="neutral" variant="ghost" :disabled="disabled" @click="removeVariable(index)">
          Remove variable {{ index + 1 }}
        </UButton>
      </div>
      <UButton
        type="button"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        :disabled="disabled || variables.length >= 50"
        @click="addVariable"
      >
        Add variable
      </UButton>
      <p class="helper">
        For a demo, set NUXT_PORTAL_DEMO_ENABLED and NUXT_PUBLIC_PORTAL_DEMO_ENABLED to true. This creates a dedicated
        database ending in _demo; its sample data resets daily.
      </p>
    </div>
  </UFormField>
</template>
