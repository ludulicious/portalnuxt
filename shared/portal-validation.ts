import { z } from 'zod'

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

export const portalCreateSchema = portalDetailsSchema.extend(portalAdminSchema.shape)

export type PortalCreateInput = z.infer<typeof portalCreateSchema>
