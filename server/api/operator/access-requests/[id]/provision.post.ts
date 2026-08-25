import { randomUUID } from 'node:crypto'
import { portalCreateSchema } from '../../../../../shared/portal-validation'

export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const id = getRouterParam(event, 'id')!,
    input = portalCreateSchema.parse(await readBody(event))
  const config = useRuntimeConfig()
  if (!config.portalBaseDomain || !config.portalImage || !config.resendApiKey || !config.resendFromEmail) {
    throw createError({ statusCode: 503, statusMessage: 'Provisioning is not configured' })
  }
  const release = await resolvePortalRelease(),
    instanceId = randomUUID(),
    client = await useDatabase().connect()
  try {
    await client.query('BEGIN')
    const request = await client.query('SELECT * FROM access_request WHERE id=$1 FOR UPDATE', [id]),
      row = request.rows[0]
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Access request not found' })
    }
    if (row.status !== 'APPROVED') {
      throw createError({ statusCode: 409, statusMessage: 'Approve this request before provisioning' })
    }
    await client.query(
      `INSERT INTO platform_instance (id,admin_email,name,slug,domain,status,provisioning_step,desired_image,desired_version) VALUES ($1,$2,$3,$4,$5,'QUEUED','DATABASE',$6,$7)`,
      [
        instanceId,
        input.adminEmail.toLowerCase(),
        input.name,
        input.slug,
        `${input.slug}.${config.portalBaseDomain}`,
        release.image,
        release.version
      ]
    )
    await client.query(`UPDATE access_request SET status='PROVISIONING',instance_id=$2,updated_at=now() WHERE id=$1`, [
      id,
      instanceId
    ])
    await client.query(
      `INSERT INTO audit_event (id,instance_id,actor_user_id,action,metadata) VALUES ($1,$2,$3,'instance.created-from-request',$4::jsonb)`,
      [
        randomUUID(),
        instanceId,
        session.user.id,
        JSON.stringify({ requestId: id, adminEmail: input.adminEmail.toLowerCase() })
      ]
    )
    await client.query('COMMIT')
    return { id: instanceId }
  } catch (error) {
    await client.query('ROLLBACK')
    if ((error as { code?: string }).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This portal address is unavailable' })
    }
    throw error
  } finally {
    client.release()
  }
})
