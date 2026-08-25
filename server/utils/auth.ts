import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import type { H3Event } from 'h3'
function createPlatformAuth() {
  const config = useRuntimeConfig()
  if (!config.databaseUrl || !config.betterAuthSecret) {
    throw new Error('DATABASE_URL and BETTER_AUTH_SECRET are required')
  }
  return betterAuth({
    appName: 'PortalNuxt',
    baseURL: config.public.platformUrl,
    secret: config.betterAuthSecret as string,
    database: new Pool({ connectionString: config.databaseUrl as string }),
    emailAndPassword: { enabled: true, disableSignUp: true, requireEmailVerification: false },
    emailVerification: {
      sendOnSignUp: process.env.NODE_ENV === 'production',
      sendVerificationEmail: async ({ user, url }) => {
        const resendKey = process.env.RESEND_API_KEY
        const from = process.env.RESEND_FROM_EMAIL
        if (!resendKey || !from) {
          throw new Error('Email verification provider is not configured')
        }
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: user.email,
            subject: 'Verify your PortalNuxt operator account',
            html: `<p>Verify your PortalNuxt operator account.</p><p><a href="${url}">Verify account</a></p>`
          })
        })
        if (!response.ok) {
          throw new Error('Email verification could not be sent')
        }
      }
    }
  })
}
let auth: ReturnType<typeof createPlatformAuth> | undefined
export function usePlatformAuth() {
  auth ||= createPlatformAuth()
  return auth
}
export async function requirePlatformSession(event: H3Event) {
  const session = await usePlatformAuth().api.getSession({ headers: event.headers })
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  return session
}
export function isOperator(email: string) {
  return String(useRuntimeConfig().operatorEmails || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}
export async function requireOperator(event: H3Event) {
  const session = await requirePlatformSession(event)
  if (!isOperator(session.user.email)) {
    throw createError({ statusCode: 403, statusMessage: 'Operator access required' })
  }
  return session
}
