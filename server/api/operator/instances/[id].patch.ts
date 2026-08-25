import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { isReleaseTransitionAllowed } from '../../../../shared/release-policy'
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('upgrade'), version: z.string().min(1).default('latest') }),
  z.object({ action: z.literal('schedule-deletion') })
])
export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const id = getRouterParam(event, 'id')!
  const instance = await findInstance(id)
  if (!instance) {
    throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  }
  const input = inputSchema.parse(await readBody(event))
  if (input.action === 'suspend') {
    if (instance.coolifyApplicationUuid) {
      await deploymentProvider().stop(instance.coolifyApplicationUuid)
    }
    await useDatabase().query(`UPDATE platform_instance SET status='SUSPENDED',updated_at=now() WHERE id=$1`, [id])
  } else if (input.action === 'upgrade') {
    const release = await resolvePortalRelease(input.version)
    const availableVersions = (await listPortalReleases()).map((item) => item.version)
    if (!isReleaseTransitionAllowed(instance.deployedVersion, release.version, availableVersions)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'A portal can only be downgraded to the immediately preceding release'
      })
    }
    await useDatabase().query(
      `UPDATE platform_instance SET desired_image=$2,desired_version=$3,status='QUEUED',provisioning_step='APPLICATION',coolify_deployment_uuid=NULL,sanitized_error=NULL,next_attempt_at=now(),updated_at=now() WHERE id=$1`,
      [id, release.image, release.version]
    )
  } else {
    await useDatabase().query(`UPDATE platform_instance SET status='DELETION_SCHEDULED',updated_at=now() WHERE id=$1`, [
      id
    ])
  }
  await useDatabase().query(
    `INSERT INTO audit_event (id,instance_id,actor_user_id,action,metadata) VALUES ($1,$2,$3,$4,$5)`,
    [randomUUID(), id, session.user.id, `instance.${input.action}`, JSON.stringify(input)]
  )
  return findInstance(id)
})
