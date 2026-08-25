const portalBaseDomain = process.env.PORTAL_BASE_DOMAIN

export default defineNuxtConfig({
  compatibilityDate: '2025-10-24',
  css: ['~/assets/css/main.css'],
  modules: ['@nuxt/eslint', '@nuxt/ui', '@pinia/nuxt'],
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,
    coolifyUrl: process.env.COOLIFY_URL,
    coolifyToken: process.env.COOLIFY_TOKEN,
    coolifyProjectUuid: process.env.COOLIFY_PROJECT_UUID,
    coolifyServerUuid: process.env.COOLIFY_SERVER_UUID,
    coolifyEnvironment: process.env.COOLIFY_ENVIRONMENT || 'production',
    portalImage: process.env.PORTAL_IMAGE,
    registryUsername: process.env.REGISTRY_USERNAME,
    registryToken: process.env.REGISTRY_TOKEN,
    portalBaseDomain,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFromEmail: process.env.RESEND_FROM_EMAIL,
    postgresAdminUrl: process.env.POSTGRES_ADMIN_URL,
    postgresRuntimeUrl: process.env.POSTGRES_RUNTIME_URL,
    operatorEmails: process.env.OPERATOR_EMAILS || '',
    accessRequestNotificationEmails: process.env.ACCESS_REQUEST_NOTIFICATION_EMAILS || '',
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
    public: {
      platformUrl: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
      portalBaseDomain: portalBaseDomain || '',
      turnstileSiteKey: process.env.NUXT_PUBLIC_TURNSTILE_SITE_KEY || ''
    }
  },
  nitro: { experimental: { openAPI: true } },
  typescript: { strict: true }
})
