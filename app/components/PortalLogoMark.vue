<script setup lang="ts">
const props = withDefaults(defineProps<{ size?: 'nav' | 'page' }>(), { size: 'nav' })

const lightLogoUrl = '/images/nuxt-customer-portal-logo-light.webp'
const darkLogoUrl = '/images/nuxt-customer-portal-logo-dark.webp'
</script>

<template>
  <span class="portal-logo" :class="`portal-logo--${props.size}`" aria-hidden="true">
    <img
      class="portal-logo__image portal-logo__image--light"
      :src="lightLogoUrl"
      alt=""
      width="48"
      height="48"
      decoding="async"
    />
    <img
      class="portal-logo__image portal-logo__image--dark"
      :src="darkLogoUrl"
      alt=""
      width="48"
      height="48"
      decoding="async"
    />
  </span>
</template>

<style scoped>
.portal-logo {
  display: block;
  flex: 0 0 auto;
}
.portal-logo--nav {
  width: 2rem;
  height: 2rem;
}
@media (min-width: 68rem) {
  :global(.nav--home) .portal-logo--nav {
    width: 2.25rem;
    height: 2.25rem;
  }
}
.portal-logo--page {
  width: clamp(3.5rem, 8vw, 5rem);
  height: clamp(3.5rem, 8vw, 5rem);
}
.portal-logo__image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.portal-logo__image--dark {
  display: none;
}
:global(.dark) .portal-logo__image--light {
  display: none;
}
:global(.dark) .portal-logo__image--dark {
  display: block;
}
</style>
