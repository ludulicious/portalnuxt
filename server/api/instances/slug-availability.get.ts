import { portalSlugSchema } from '../../../shared/portal-validation'

export default defineEventHandler(async (event) => {
  await requirePlatformSession(event)
  const parsed = portalSlugSchema.safeParse(getQuery(event).slug)
  if (!parsed.success) {
    return { available: false }
  }

  const result = await useDatabase().query<{ available: boolean }>(
    'SELECT NOT EXISTS (SELECT 1 FROM platform_instance WHERE slug = $1) AS available',
    [parsed.data]
  )
  return { available: result.rows[0]?.available === true }
})
