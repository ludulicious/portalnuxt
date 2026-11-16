export default defineEventHandler(async (event) => {
  await requireOperator(event)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (getQuery(event).refresh !== 'true') {
    return listPortalReleases()
  }
  try {
    return await refreshPortalReleases()
  } catch (error) {
    console.error('Manual portal release refresh failed:', sanitizeProvisioningError(error))
    throw createError({
      statusCode: 502,
      statusMessage: 'Portal releases could not be refreshed. Please try again.'
    })
  }
})
