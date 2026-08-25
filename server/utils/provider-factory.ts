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
  for (const key of ['coolifyUrl', 'coolifyToken', 'coolifyProjectUuid', 'coolifyServerUuid'] as const) {
    if (!config[key]) {
      throw new Error(`${key} is required`)
    }
  }
  return new CoolifyProvider({
    url: config.coolifyUrl as string,
    token: config.coolifyToken as string,
    projectUuid: config.coolifyProjectUuid as string,
    serverUuid: config.coolifyServerUuid as string,
    environment: config.coolifyEnvironment as string
  })
}
