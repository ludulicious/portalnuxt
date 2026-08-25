<script setup lang="ts">
import { authClient } from '~/utils/auth-client'

useSeoMeta({ title: 'Reset operator password' })

const step = ref<'email' | 'reset' | 'done'>('email')
const email = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')

async function sendCode() {
  busy.value = true
  error.value = ''
  message.value = ''
  const result = await authClient.emailOtp.requestPasswordReset({ email: email.value })
  busy.value = false
  if (result.error) {
    error.value = result.error.message || 'The reset code could not be sent.'
    return
  }
  step.value = 'reset'
  message.value = 'If an operator account exists for this address, a six-digit code has been sent.'
}

async function resetPassword() {
  error.value = ''
  if (!/^\d{6}$/.test(code.value)) {
    error.value = 'Enter the six-digit code from the email.'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Use a password of at least eight characters.'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'The passwords do not match.'
    return
  }

  busy.value = true
  const result = await authClient.emailOtp.resetPassword({
    email: email.value,
    otp: code.value,
    password: password.value
  })
  busy.value = false
  if (result.error) {
    error.value = result.error.message || 'The code is invalid or has expired.'
    return
  }
  step.value = 'done'
  message.value = 'Your password has been reset. You can now log in.'
}
</script>

<template>
  <section class="login-page">
    <div class="login-card">
      <p class="eyebrow">PORTALNUXT OPERATIONS</p>
      <h1>Reset password</h1>

      <form v-if="step === 'email'" class="form" @submit.prevent="sendCode">
        <p class="helper">Enter your operator email address to receive a six-digit reset code.</p>
        <label class="field">Email<input v-model="email" required type="email" autocomplete="email" /></label>
        <p v-if="error" class="helper helper--error">{{ error }}</p>
        <button class="btn btn--primary" :disabled="busy">{{ busy ? 'Sending…' : 'Send reset code' }}</button>
      </form>

      <form v-else-if="step === 'reset'" class="form" @submit.prevent="resetPassword">
        <p class="helper helper--success">{{ message }}</p>
        <label class="field"
          >Reset code<input
            v-model="code"
            required
            type="text"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            autocomplete="one-time-code"
        /></label>
        <label class="field"
          >New password<input v-model="password" required type="password" minlength="8" autocomplete="new-password"
        /></label>
        <label class="field"
          >Confirm password<input
            v-model="confirmPassword"
            required
            type="password"
            minlength="8"
            autocomplete="new-password"
        /></label>
        <p v-if="error" class="helper helper--error">{{ error }}</p>
        <button class="btn btn--primary" :disabled="busy">{{ busy ? 'Resetting…' : 'Reset password' }}</button>
        <button class="btn" type="button" :disabled="busy" @click="sendCode">Send a new code</button>
      </form>

      <div v-else class="form">
        <p class="helper helper--success">{{ message }}</p>
        <NuxtLink class="btn btn--primary" to="/login">Return to login</NuxtLink>
      </div>

      <NuxtLink v-if="step !== 'done'" class="login-card__link" to="/login">Back to login</NuxtLink>
    </div>
  </section>
</template>
