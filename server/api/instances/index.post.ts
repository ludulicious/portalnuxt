import { randomUUID } from 'node:crypto'
import { portalCreateSchema } from '../../../shared/portal-validation'
export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const input = portalCreateSchema.parse(await readBody(event))
  const config = useRuntimeConfig()
  if (!config.portalBaseDomain || !config.portalImage || !config.resendApiKey || !config.resendFromEmail) {
    throw createError({ statusCode: 503, statusMessage: 'Provisioning is not configured' })
  }
  const release = await resolvePortalRelease()
  const id = randomUUID()
  const domain = `${input.slug}.${config.portalBaseDomain}`
  try {
    const result = await useDatabase().query(
      `INSERT INTO platform_instance (id,admin_email,name,slug,domain,status,provisioning_step,desired_image,desired_version) VALUES ($1,$2,$3,$4,$5,'QUEUED','DATABASE',$6,$7) RETURNING *`,
      [id, input.adminEmail.toLowerCase(), input.name, input.slug, domain, release.image, release.version]
    )
    await useDatabase().query(
      `INSERT INTO audit_event (id,instance_id,actor_user_id,action,metadata) VALUES ($1,$2,$3,'instance.created',$4::jsonb)`,
      [
        randomUUID(),
        id,
        session.user.id,
        JSON.stringify({ adminEmail: input.adminEmail.toLowerCase(), version: release.version, image: release.image })
      ]
    )
    return mapInstance(result.rows[0])
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'This portal address is unavailable' })
    }
    throw error
  }
})
