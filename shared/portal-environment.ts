import { z } from 'zod'

export const managedEnvironmentNames = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'PUBLIC_URL',
  'BETTER_AUTH_URL',
  'ADMIN_EMAILS',
  'PORTAL_PROVIDER_NAME',
  'PORTAL_PROVIDER_SLUG',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'PORTAL_REGISTRATION_MODE',
  'PORTAL_GITHUB_ENABLED',
  'PORTAL_GOOGLE_ENABLED',
  'NODE_ENV',
  'PORTAL_ENCRYPTION_KEY'
] as const

const reservedNames = new Set<string>(managedEnvironmentNames.flatMap((name) => [name, `NUXT_${name}`]))

export const portalEnvironmentSchema = z
  .array(
    z.object({
      name: z
        .string()
        .trim()
        .max(128, 'Use no more than 128 characters.')
        .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Use letters, numbers, and underscores; start with a letter or underscore.')
        .refine((name) => !reservedNames.has(name.toUpperCase()), 'This variable is managed by PortalNuxt.'),
      value: z
        .string()
        .max(16384, 'Use no more than 16,384 characters.')
        .refine((value) => !value.includes('\0'), 'Values cannot contain a null character.')
    })
  )
  .max(50, 'Use no more than 50 extra variables.')
  .superRefine((variables, ctx) => {
    const names = new Set<string>()
    variables.forEach(({ name }, index) => {
      if (names.has(name)) {
        ctx.addIssue({ code: 'custom', path: [index, 'name'], message: 'Each variable name must be unique.' })
      }
      names.add(name)
    })
    if (variables.reduce((size, variable) => size + variable.name.length + variable.value.length, 0) > 131072) {
      ctx.addIssue({ code: 'custom', message: 'Keep extra variables within 131,072 characters in total.' })
    }
    const serverDemo = variables.find(({ name }) => name === 'NUXT_PORTAL_DEMO_ENABLED')?.value === 'true'
    const publicDemo = variables.find(({ name }) => name === 'NUXT_PUBLIC_PORTAL_DEMO_ENABLED')?.value === 'true'
    if (serverDemo !== publicDemo) {
      ctx.addIssue({ code: 'custom', message: 'Set both demo flags to true to enable demo mode.' })
    }
  })

export type PortalEnvironmentVariable = z.infer<typeof portalEnvironmentSchema>[number]

export function isDemoEnvironment(variables: PortalEnvironmentVariable[]) {
  return variables.some(({ name, value }) => name === 'NUXT_PORTAL_DEMO_ENABLED' && value === 'true')
}
