export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV === 'test') {
    return
  }
  const timer = setInterval(
    () =>
      processProvisioningWork().catch((error) =>
        console.error('Provisioning worker failed:', sanitizeProvisioningError(error))
      ),
    5000
  )
  timer.unref()
})
