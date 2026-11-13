export default defineNitroPlugin(() => {
  const refresh = () =>
    refreshPortalReleases().catch((error) =>
      console.error('Portal release refresh failed:', sanitizeProvisioningError(error))
    )
  void refresh()
  const timer = setInterval(refresh, 15 * 60 * 1000)
  timer.unref()
})
