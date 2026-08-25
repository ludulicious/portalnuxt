export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const result = await useDatabase().query('SELECT * FROM platform_instance ORDER BY created_at DESC')
  return result.rows.map(mapInstance)
})
