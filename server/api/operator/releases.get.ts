export default defineEventHandler(async (event) => {
  await requireOperator(event)
  return getQuery(event).refresh === 'true' ? refreshPortalReleases() : listPortalReleases()
})
