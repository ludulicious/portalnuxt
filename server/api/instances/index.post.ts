import { randomUUID } from 'node:crypto'
import { isPortalDomainReserved, portalCreateSchema } from '../../../shared/portal-validation'
export default defineEventHandler(async (event) => {
  const session = await requireOperator(event)
  const parsed = portalCreateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 422, statusMessage: parsed.error.issues[0]!.message })
  }
  const input = parsed.data
  const config = useRuntimeConfig()
  if (!config.portalBaseDomain || !config.portalImage || !config.resendApiKey || !config.resendFromEmail) {
    throw createError({ statusCode: 503, statusMessage: 'Provisioning is not configured' })
  }
  const domain = input.customDomain || `${input.slug}.${config.portalBaseDomain}`.toLowerCase()
  if (isPortalDomainReserved(domain, input.slug, String(config.portalBaseDomain))) {
    throw createError({ statusCode: 409, statusMessage: 'This address is reserved for another portal' })
  }
  const release = await resolvePortalRelease()
  const id = randomUUID()
  try {
    const result = await useDatabase().query(
      `INSERT INTO platform_instance (id,admin_email,name,slug,domain,status,provisioning_step,desired_image,desired_version,encrypted_portal_encryption_key) VALUES ($1,$2,$3,$4,$5,'QUEUED','DATABASE',$6,$7,$8) RETURNING *`,
      [
        id,
        input.adminEmail.toLowerCase(),
        input.name,
        input.slug,
        domain,
        release.image,
        release.version,
        encryptSecret(generatePortalEncryptionKey())
      ]
    )
    await useDatabase().query(
      `INSERT INTO audit_event (id,instance_id,actor_user_id,action,metadata) VALUES ($1,$2,$3,'instance.created',$4::jsonb)`,
      [
        randomUUID(),
        id,
        session.user.id,
        JSON.stringify({
          adminEmail: input.adminEmail.toLowerCase(),
          domain,
          version: release.version,
          image: release.image
        })
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
