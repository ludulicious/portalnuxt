export function databaseProvider() {
  const config = useRuntimeConfig()
  const url = config.postgresAdminUrl
  if (!url) {
    throw new Error('POSTGRES_ADMIN_URL is required')
  }
  return new SharedPostgresProvider(url as string, config.postgresRuntimeUrl as string | undefined)
}
export function deploymentProvider() {
  const config = useRuntimeConfig()
  const coolify = {
    url: process.env.COOLIFY_URL || (config.coolifyUrl as string | undefined),
    token: process.env.COOLIFY_TOKEN || (config.coolifyToken as string | undefined),
    projectUuid: process.env.COOLIFY_PROJECT_UUID || (config.coolifyProjectUuid as string | undefined),
    serverUuid: process.env.COOLIFY_SERVER_UUID || (config.coolifyServerUuid as string | undefined),
    environment: process.env.COOLIFY_ENVIRONMENT || (config.coolifyEnvironment as string | undefined) || 'production'
  }
  for (const key of ['url', 'token', 'projectUuid', 'serverUuid'] as const) {
    if (!coolify[key]) {
      throw new Error(`Coolify ${key} is required`)
    }
  }
  return new CoolifyProvider({
    url: coolify.url!,
    token: coolify.token!,
    projectUuid: coolify.projectUuid!,
    serverUuid: coolify.serverUuid!,
    environment: coolify.environment
  })
}
