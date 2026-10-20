import { randomUUID } from 'node:crypto'
import { isPortalDomainReserved, portalDomainInputSchema } from '../../../../../shared/portal-validation'

export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const id = getRouterParam(event, 'id')!
  const parsed = portalDomainInputSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]!.message })
  }
  const { domain } = parsed.data
  const client = await useDatabase().connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{
      domain: string
      slug: string
      status: string
      locked_at: Date | null
      deployed_version: string | null
    }>('SELECT domain,slug,status,locked_at,deployed_version FROM platform_instance WHERE id=$1 FOR UPDATE', [id])
    const instance = result.rows[0]
    if (!instance) {
      throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
    }
    if (!['ACTIVE', 'ERROR'].includes(instance.status) || instance.locked_at) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Wait until the instance is active or provisioning has failed before changing its domain'
      })
    }
    const baseDomain = String(useRuntimeConfig().portalBaseDomain || '').toLowerCase()
    if (isPortalDomainReserved(domain, instance.slug, baseDomain)) {
      throw createError({ statusCode: 409, statusMessage: 'This address is reserved for another portal' })
    }
    if (domain !== instance.domain.toLowerCase()) {
      await client.query(
        `UPDATE platform_instance SET domain=$2,domain_configuration_pending=true,status='QUEUED',provisioning_step=CASE WHEN provisioning_step IN ('DATABASE','SECRETS') THEN provisioning_step ELSE 'APPLICATION' END,coolify_deployment_uuid=NULL,health_check_started_at=NULL,sanitized_error=NULL,retry_count=0,next_attempt_at=now(),updated_at=now() WHERE id=$1`,
        [id, domain]
      )
      await client.query(
        `INSERT INTO audit_event (id,instance_id,actor_user_id,action,metadata) VALUES ($1,$2,$3,'instance.domain-changed',$4::jsonb)`,
        [randomUUID(), id, session.user.id, JSON.stringify({ previousDomain: instance.domain, domain })]
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    if ((error as { code?: string }).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This domain is already assigned to another instance' })
    }
    throw error
  } finally {
    client.release()
  }
  return findInstance(id)
})
