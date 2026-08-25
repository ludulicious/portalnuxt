export const INSTANCE_STATUSES = [
  'PENDING_EMAIL',
  'QUEUED',
  'PROVISIONING',
  'ACTIVE',
  'ERROR',
  'SUSPENDED',
  'DELETION_SCHEDULED'
] as const
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number]
export const PROVISIONING_STEPS = [
  'DATABASE',
  'SECRETS',
  'APPLICATION',
  'ENVIRONMENT',
  'DEPLOYMENT',
  'HEALTH',
  'COMPLETE'
] as const
export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number]
export interface PortalInstance {
  id: string
  adminEmail: string
  name: string
  slug: string
  domain: string
  status: InstanceStatus
  step: ProvisioningStep
  desiredImage: string
  desiredVersion: string | null
  deployedImage: string | null
  deployedVersion: string | null
  coolifyApplicationUuid: string | null
  coolifyDeploymentUuid: string | null
  sanitizedError: string | null
  createdAt: string
  updatedAt: string
}
