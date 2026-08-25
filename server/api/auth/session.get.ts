export default defineEventHandler(async (event) => {
  const session = await usePlatformAuth().api.getSession({ headers: event.headers })
  return session ? { user: session.user, operator: isOperator(session.user.email) } : null
})
