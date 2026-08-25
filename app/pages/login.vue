<script setup lang="ts">
import { authClient } from '~/utils/auth-client'
useSeoMeta({ title: 'Operator login' })
const account = reactive({ email: '', password: '' }),
  busy = ref(false),
  error = ref('')
async function signIn() {
  busy.value = true
  error.value = ''
  const result = await authClient.signIn.email(account)
  busy.value = false
  if (result.error) {
    error.value = result.error.message || 'Login failed.'
    return
  }
  await refreshNuxtData('platform-session')
  await navigateTo('/instances')
}
</script>
<template>
  <section class="login-page">
    <div class="login-card">
      <p class="eyebrow">PORTALNUXT OPERATIONS</p>
      <h1>Operator login</h1>
      <p class="helper">This control plane is restricted to PortalNuxt operators.</p>
      <form class="form" @submit.prevent="signIn">
        <label class="field">Email<input v-model="account.email" type="email" autocomplete="email" /></label
        ><label class="field"
          >Password<input v-model="account.password" type="password" autocomplete="current-password"
        /></label>
        <NuxtLink class="login-card__link" to="/forgot-password">Forgot password?</NuxtLink>
        <p v-if="error" class="helper helper--error">{{ error }}</p>
        <button class="btn btn--primary" :disabled="busy">{{ busy ? 'Logging in…' : 'Login' }}</button>
      </form>
    </div>
  </section>
</template>
