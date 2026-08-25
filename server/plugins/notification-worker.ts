export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV === 'test') {
    return
  }
  const timer = setInterval(
    () => processNotificationOutbox().catch((error) => console.error('Notification worker failed:', error)),
    10_000
  )
  timer.unref()
})
