<script setup lang="ts">
import { authClient } from '~/utils/auth-client'

useHead({
  titleTemplate: (title) => (title ? `${title} / PortalNuxt` : 'PortalNuxt'),
  htmlAttrs: { lang: 'en' },
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '64x64',
      href: '/favicon-light.png',
      media: '(prefers-color-scheme: light)'
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '64x64',
      href: '/favicon-dark.png',
      media: '(prefers-color-scheme: dark)'
    },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
  ]
})

const profile = useTemplateRef<HTMLElement>('profile')
const profileOpen = ref(false)
const signingOut = ref(false)
const { data: session, refresh: refreshSession } = await useFetch('/api/auth/session', { key: 'platform-session' })
const user = computed(() => session.value?.user)
const operator = computed(() => session.value?.operator === true)
const initials = computed(() => {
  const source = user.value?.name?.trim() || user.value?.email || ''
  const parts = source.split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0]?.[0]}${parts.at(-1)?.[0]}` : source.slice(0, 2)).toUpperCase()
})
function onPointerDown(event: PointerEvent) {
  if (profileOpen.value && !profile.value?.contains(event.target as Node)) {
    profileOpen.value = false
  }
}

async function signOut() {
  signingOut.value = true
  await authClient.signOut()
  await refreshSession()
  profileOpen.value = false
  signingOut.value = false
  await navigateTo('/')
}

onMounted(async () => {
  await refreshSession()
  window.addEventListener('pointerdown', onPointerDown)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown)
})
</script>

<template>
  <UApp>
    <div class="shell">
      <header class="nav">
        <div class="nav__inner">
          <NuxtLink class="nav__brand" to="/"><PortalLogoMark />PortalNuxt</NuxtLink>
          <nav v-if="operator" class="nav__links" aria-label="Primary">
            <NuxtLink class="nav__link" to="/instances">Instances</NuxtLink>
            <NuxtLink class="nav__link" to="/access-requests">Access requests</NuxtLink>
          </nav>
          <nav v-else class="nav__links" aria-label="Primary">
            <a class="nav__link" href="/#request-access">Request access</a
            ><a class="nav__link" href="https://github.com/ludulicious/nuxt-customer-portal">Open source</a>
          </nav>
          <UButton
            v-if="!user"
            to="/login"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-log-in"
            label="Login"
          />
          <UColorModeButton class="color-mode-toggle" variant="outline" size="lg" />
          <div v-if="user" ref="profile" class="profile">
            <button
              class="profile__trigger"
              type="button"
              :aria-expanded="profileOpen"
              aria-haspopup="menu"
              aria-label="Open profile menu"
              @click.stop="profileOpen = !profileOpen"
            >
              <span class="profile__avatar" aria-hidden="true">{{ initials }}</span>
              <span class="profile__chevron" aria-hidden="true">⌄</span>
            </button>
            <div v-if="profileOpen" class="profile__menu" role="menu">
              <div class="profile__identity">
                <strong>{{ user.name || 'Platform user' }}</strong>
                <span>{{ user.email }}</span>
              </div>
              <NuxtLink class="profile__item" role="menuitem" to="/instances" @click="profileOpen = false"
                >Instances</NuxtLink
              >
              <button
                class="profile__item profile__item--logout"
                role="menuitem"
                type="button"
                :disabled="signingOut"
                @click="signOut"
              >
                {{ signingOut ? 'Logging out…' : 'Logout' }}
              </button>
            </div>
          </div>
        </div>
      </header>
      <main class="main"><NuxtPage /></main>
      <footer class="main footer">
        <div><strong>PortalNuxt</strong><span>© 2026 Ludulicious B.V.</span></div>
        <nav><NuxtLink to="/terms">Terms of service</NuxtLink><NuxtLink to="/privacy">Privacy policy</NuxtLink></nav>
      </footer>
    </div>
  </UApp>
</template>
