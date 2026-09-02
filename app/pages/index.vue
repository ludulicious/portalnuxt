<script setup lang="ts">
useSeoMeta({
  title: 'Customer Portal Evaluations',
  description: 'Evaluate the Nuxt Customer Portal for your organization.'
})
</script>
<template>
  <div class="public-home">
    <section class="public-hero">
      <p class="eyebrow">MANAGED NUXT CUSTOMER PORTAL</p>
      <h1>Your portal, managed.</h1>
      <div class="public-hero__lede">
        <p>A dedicated Nuxt Customer Portal, operated for your organization.</p>
        <div class="public-hero__actions">
          <a class="btn btn--primary" href="#request-access">Request access</a
          ><a class="public-hero__source" href="https://nuxt-customer-portal.com" target="_blank" rel="noreferrer"
            >Nuxt Customer Portal ↗</a
          >
        </div>
      </div>
    </section>
    <section class="workflow" aria-label="How PortalNuxt works">
      <article>
        <span>1.0 · EVALUATE</span>
        <div>
          <h2>Evaluate without commitment.</h2>
          <p>
            Don't have time to install and operate the Nuxt Customer Portal yourself? We will host an evaluation version
            for you. You will have your own portal address, and we will handle the infrastructure.
          </p>
        </div>
      </article>
      <article>
        <span>2.0 · REQUEST</span>
        <div>
          <h2>Request access to the evaluation version.</h2>
          <p>Fill out the form below to request access to the evaluation version.</p>
        </div>
      </article>
      <article>
        <span>3.0 · REVIEW</span>
        <div>
          <h2>We review every request.</h2>
          <p>
            There is no instant signup or automatic approval. We reply by email with the outcome and may ask follow-up
            questions.
          </p>
        </div>
      </article>
      <article>
        <span>4.0 · LAUNCH</span>
        <div>
          <h2>Your portal, ready.</h2>
          <p>
            When approved, we provision the domain, database, authentication secret, and application. Your nominated
            administrator receives the portal URL when it is healthy.
          </p>
        </div>
      </article>
    </section>
    <section id="request-access" class="request-section">
      <header>
        <p class="eyebrow">EARLY ACCESS</p>
        <h2>Request access to the evaluation version.</h2>
        <p>Fill out the form below to request access to the evaluation version.</p>
      </header>
      <AccessRequestForm />
    </section>
  </div>
</template>
