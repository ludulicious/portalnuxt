export default defineEventHandler(async () => {
  await useDatabase().query('SELECT 1')
  return { status: 'ok' }
})
