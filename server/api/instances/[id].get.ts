export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const instance = await findInstance(getRouterParam(event, 'id')!)
  if (!instance) {
    throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  }
  return instance
})
