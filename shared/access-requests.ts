import { z } from 'zod'

export const ACCESS_REQUEST_STATUSES = [
  'NEW',
  'REVIEWING',
  'APPROVED',
  'DECLINED',
  'PROVISIONING',
  'PROVISIONED'
] as const
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number]

export const EXPECTED_USER_RANGES = ['1-10', '11-50', '51-200', '201+'] as const
export const DESIRED_TIMELINES = ['exploring', '1-month', '1-3-months', '3-months-plus'] as const

const optionalUrl = z.union([z.literal(''), z.url('Enter a complete URL, including https://.')]).optional()
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional().default('')

export const accessRequestInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: z.email('Enter a valid work email address.').trim().toLowerCase().max(320),
  organization: z.string().trim().min(2, 'Enter your organization.').max(160),
  website: optionalUrl,
  intendedUse: z.string().trim().min(20, 'Tell us a little more about the intended use.').max(2000),
  expectedUsers: z.enum(EXPECTED_USER_RANGES),
  desiredTimeline: z.enum(DESIRED_TIMELINES),
  notes: optionalText(2000),
  preferredSlug: z
    .union([
      z.literal(''),
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .min(3)
        .max(63)
    ])
    .optional()
    .default(''),
  consent: z.boolean().refine((value) => value, 'Please confirm that PortalNuxt may contact you about this request.'),
  termsAccepted: z.boolean().refine((value) => value, 'Please agree to the Terms of Service before submitting.'),
  turnstileToken: z.string().max(4096).optional().default(''),
  contactCode: z.string().max(200).optional().default('')
})
export type AccessRequestInput = z.infer<typeof accessRequestInputSchema>

export interface AccessRequest {
  id: string
  status: AccessRequestStatus
  name: string
  email: string
  organization: string
  website: string | null
  intendedUse: string
  expectedUsers: string
  desiredTimeline: string
  notes: string | null
  preferredSlug: string | null
  operatorNotes: string | null
  declineReason: string | null
  reviewerUserId: string | null
  instanceId: string | null
  termsAcceptedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AccessRequestListResponse {
  items: AccessRequest[]
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number; hasNext: boolean }
}

export const accessRequestTransitionSchema = z.object({
  action: z.enum(['start-review', 'approve', 'decline', 'save-notes']),
  operatorNotes: z.string().trim().max(4000).optional(),
  declineReason: z.string().trim().max(2000).optional()
})
