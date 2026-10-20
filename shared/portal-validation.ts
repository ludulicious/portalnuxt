import { z } from 'zod'

export const portalDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253, 'Use no more than 253 characters.')
  .refine(
    (value) =>
      value.includes('.') &&
      value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
      /^[a-z]{2,63}$/.test(value.split('.').at(-1)!),
    'Enter a domain name such as portal.example.com, without https://, a port, or a path.'
  )

export const portalDomainInputSchema = z.object({ domain: portalDomainSchema })

export function isPortalDomainReserved(domain: string, slug: string, baseDomain: string) {
  const base = baseDomain.toLowerCase()
  return Boolean(base && (domain === base || domain.endsWith(`.${base}`)) && domain !== `${slug}.${base}`)
}

export const portalSlugSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(63, 'Use no more than 63 characters.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens only.')

export const portalDetailsSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(100, 'Use no more than 100 characters.'),
  slug: portalSlugSchema
})

export const portalAdminSchema = z.object({
  adminEmail: z.email('Enter a valid administrator email address.').max(320, 'Use no more than 320 characters.')
})

export const portalCreateSchema = portalDetailsSchema.extend(portalAdminSchema.shape).extend({
  customDomain: z
    .string()
    .trim()
    .pipe(z.union([z.literal(''), portalDomainSchema]))
    .optional()
})

export type PortalCreateInput = z.infer<typeof portalCreateSchema>
