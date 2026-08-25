export interface DatabaseResource {
  databaseName: string
  roleName: string
  databaseUrl: string
}
export interface DatabaseSpec {
  instanceId: string
  slug: string
}
export interface DatabaseProvider {
  ensure(spec: DatabaseSpec): Promise<DatabaseResource>
  validate(databaseUrl: string): Promise<void>
}
export interface DeploymentSpec {
  instanceId: string
  slug: string
  name: string
  domain: string
  image: string
  applicationUuid?: string | null
}
export interface DeploymentProvider {
  ensureApplication(spec: DeploymentSpec): Promise<string>
  configure(applicationUuid: string, environment: Record<string, string>): Promise<void>
  deploy(applicationUuid: string): Promise<string>
  stop(applicationUuid: string): Promise<void>
  deploymentStatus(deploymentUuid: string): Promise<'pending' | 'running' | 'finished' | 'failed'>
}
