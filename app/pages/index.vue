<script setup lang="ts">
import { toPortalSlug } from '~~/shared/access-requests'

const config = useRuntimeConfig()
const portalHost = computed(() => config.public.portalBaseDomain || 'portalnuxt.com')
const preview = reactive({ preferredSlug: '', organization: '', requested: false })
const plateSlug = computed(() => toPortalSlug(preview.preferredSlug) || 'your-org')
const plateTitle = computed(() => {
  const organization = preview.organization.trim()
  return organization ? `What ${organization} gets` : 'What you get'
})
const plateNote = computed(() => {
  if (preview.requested) {
    return 'This is the address you asked for. Suggested, not reserved.'
  }
  if (toPortalSlug(preview.preferredSlug)) {
    return 'Suggested from your organization — not reserved.'
  }
  return 'Example address. Choose yours on the request — suggested, not reserved.'
})

function onPreview(next: { preferredSlug: string; organization: string; requested: boolean }) {
  Object.assign(preview, next)
}

useSeoMeta({
  title: 'Customer Portal Evaluations',
  description: 'Evaluate the Nuxt Customer Portal for your organization.'
})
</script>

<template>
  <div class="public-home">
    <div class="public-rail">
      <section class="public-intro" aria-labelledby="public-heading">
        <PortalLogoMark size="page" />
        <h1 id="public-heading"><span>Your managed </span><span>portal.</span></h1>
        <p class="public-pitch__lede">A dedicated Nuxt Customer Portal, operated for your organization.</p>
        <p class="public-pitch__body">
          Don't have time to install and operate it yourself? We host an evaluation at your own portal address and
          handle the infrastructure.
        </p>
      </section>
      <div class="public-details">
        <dl class="public-itinerary">
          <div>
            <dt>Ask</dt>
            <dd>Fill in the request. There is no instant signup.</dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>We read every request and reply by email. We may ask follow-up questions.</dd>
          </div>
          <div>
            <dt>Launch</dt>
            <dd>
              When approved, we provision the domain, database, authentication secret, and application. Your nominated
              administrator receives the URL when it is healthy.
            </dd>
          </div>
        </dl>
        <figure class="public-plate" :class="{ 'public-plate--live': Boolean(toPortalSlug(preview.preferredSlug)) }">
          <figcaption>{{ plateTitle }}</figcaption>
          <p class="public-plate__host">
            <span class="public-plate__slug">{{ plateSlug }}</span
            ><span class="public-plate__domain">.{{ portalHost }}</span>
          </p>
          <p class="public-plate__note">{{ plateNote }}</p>
        </figure>
        <a class="public-pitch__source" href="https://nuxt-customer-portal.com" target="_blank" rel="noreferrer"
          >Nuxt Customer Portal ↗</a
        >
      </div>
    </div>
    <section id="request-access" class="public-request">
      <header>
        <h2>Request an evaluation</h2>
        <p>
          Introduce your organization and the work this portal should support. We review every request by hand and only
          provision an evaluation after we approve it — this is not a signup.
        </p>
      </header>
      <AccessRequestForm @preview="onPreview" />
    </section>
  </div>
</template>
