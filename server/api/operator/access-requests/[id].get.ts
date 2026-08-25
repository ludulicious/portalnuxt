export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const result = await useDatabase().query('SELECT * FROM access_request WHERE id=$1', [getRouterParam(event, 'id')])
  if (!result.rows[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Access request not found' })
  }
  return mapAccessRequest(result.rows[0])
})
