<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    confirmColor?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
    loading?: boolean
    confirmDisabled?: boolean
  }>(),
  {
    description: undefined,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmColor: 'primary',
    loading: false,
    confirmDisabled: false
  }
)

const isOpen = defineModel<boolean>('isOpen', { required: true })
defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal v-model:open="isOpen" :title="title" :description="description">
    <template #body>
      <slot />
    </template>
    <template #footer>
      <div class="confirmation-modal__actions">
        <UButton color="neutral" variant="ghost" :disabled="loading" @click="isOpen = false">
          {{ cancelLabel }}
        </UButton>
        <UButton :color="confirmColor" :loading="loading" :disabled="confirmDisabled" @click="$emit('confirm')">
          {{ confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.confirmation-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  width: 100%;
}
</style>
