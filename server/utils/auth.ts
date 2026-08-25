import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { Pool } from 'pg'
import type { H3Event } from 'h3'

async function sendAuthEmail(to: string, subject: string, html: string) {
  const config = useRuntimeConfig()
  if (!config.resendApiKey || !config.resendFromEmail) {
    throw new Error('Authentication email provider is not configured')
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.resendFromEmail, to, subject, html })
  })
  if (!response.ok) {
    throw new Error(`Authentication email could not be sent (HTTP ${response.status})`)
  }
}

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
        await sendAuthEmail(
          user.email,
          'Verify your PortalNuxt operator account',
          renderPortalEmail(
            `<p style="margin:0">Verify your PortalNuxt operator account by using the button below.</p>${portalEmailButton('Verify account', url)}<p style="margin:0;font-size:13px;line-height:21px;color:#64748b">If you did not expect this email, you can safely ignore it.</p>`
          )
        )
      }
    },
    plugins: [
      emailOTP({
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'forget-password') {
            return
          }
          await sendAuthEmail(
            email,
            'Your PortalNuxt password reset code',
            renderPortalEmail(
              `<p style="margin:0 0 18px">Use this code to reset your PortalNuxt operator password:</p><div style="margin:0 0 18px;padding:18px;border:1px solid #dbe3ef;border-radius:10px;background:#f8fafc;text-align:center;font-family:Arial,sans-serif;font-size:30px;font-weight:800;letter-spacing:8px;line-height:36px;color:#172033">${escapeEmailHtml(otp)}</div><p style="margin:0 0 8px">The code expires in five minutes and can only be attempted three times.</p><p style="margin:0;font-size:13px;line-height:21px;color:#64748b">If you did not request a password reset, you can safely ignore this email.</p>`
            )
          )
        }
      })
    ]
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
