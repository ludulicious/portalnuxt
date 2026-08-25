import { randomUUID } from 'node:crypto'
export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const id = getRouterParam(event, 'id')!
  const instance = await findInstance(id)
  if (!instance) {
    throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  }
  if (instance.status !== 'ERROR') {
    throw createError({ statusCode: 409, statusMessage: 'Only failed provisioning can be retried' })
  }
  const release = await resolvePortalRelease()
  await useDatabase().query(
    `UPDATE platform_instance SET desired_image=$2,desired_version=$3,status='QUEUED',provisioning_step='DATABASE',coolify_deployment_uuid=NULL,sanitized_error=NULL,next_attempt_at=now(),updated_at=now() WHERE id=$1`,
    [id, release.image, release.version]
  )
  await useDatabase().query(
    `INSERT INTO audit_event (id,instance_id,actor_user_id,action,metadata) VALUES ($1,$2,$3,'instance.retry_requested',$4::jsonb)`,
    [
      randomUUID(),
      id,
      session.user.id,
      JSON.stringify({ image: release.image, version: release.version, refreshDatabaseConnection: true })
    ]
  )
  return { queued: true }
})
