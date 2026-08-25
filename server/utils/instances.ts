import type { PortalInstance } from '../../shared/control-plane'
interface InstanceRow {
  id: string
  admin_email: string
  name: string
  slug: string
  domain: string
  status: PortalInstance['status']
  provisioning_step: PortalInstance['step']
  desired_image: string
  desired_version: string | null
  deployed_image: string | null
  deployed_version: string | null
  coolify_application_uuid: string | null
  coolify_deployment_uuid: string | null
  sanitized_error: string | null
  created_at: Date
  updated_at: Date
}
export function mapInstance(row: InstanceRow): PortalInstance {
  return {
    id: row.id,
    adminEmail: row.admin_email,
    name: row.name,
    slug: row.slug,
    domain: row.domain,
    status: row.status,
    step: row.provisioning_step,
    desiredImage: row.desired_image,
    desiredVersion: row.desired_version,
    deployedImage: row.deployed_image,
    deployedVersion: row.deployed_version,
    coolifyApplicationUuid: row.coolify_application_uuid,
    coolifyDeploymentUuid: row.coolify_deployment_uuid,
    sanitizedError: row.sanitized_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }
}
export async function findInstance(id: string) {
  const result = await useDatabase().query<InstanceRow>('SELECT * FROM platform_instance WHERE id = $1', [id])
  return result.rows[0] ? mapInstance(result.rows[0]) : null
}
