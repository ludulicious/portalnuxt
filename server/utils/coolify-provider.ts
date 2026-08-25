import type { DeploymentProvider, DeploymentSpec } from './providers'

interface CoolifyConfig {
  url: string
  token: string
  projectUuid: string
  serverUuid: string
  environment: string
}

export function parseCoolifyImageReference(reference: string) {
  const value = reference.trim()
  const digest = value.match(/^(.+)@sha256:([a-f0-9]{64})$/i)
  if (digest) {
    return { imageName: digest[1]!, imageTag: `sha256-${digest[2]!.toLowerCase()}` }
  }

  const tagAt = value.lastIndexOf(':')
  const slashAt = value.lastIndexOf('/')
  if (tagAt > slashAt) {
    return { imageName: value.slice(0, tagAt), imageTag: value.slice(tagAt + 1) }
  }

  return { imageName: value, imageTag: 'latest' }
}

export class CoolifyProvider implements DeploymentProvider {
  constructor(private readonly config: CoolifyConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.url.replace(/\/$/, '')}/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        ...init.headers
      }
    })
    if (!response.ok) {
      throw new Error(`Coolify request failed (${response.status})`)
    }
    return response.json() as Promise<T>
  }

  async ensureApplication(spec: DeploymentSpec) {
    const applications = await this.request<Array<{ uuid: string; name: string }>>('/applications')
    const applicationName = `portal-${spec.slug}`
    const existing = applications.find(
      (application) => application.uuid === spec.applicationUuid || application.name === applicationName
    )
    const { imageName, imageTag } = parseCoolifyImageReference(spec.image)
    if (existing) {
      await this.request(`/applications/${existing.uuid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: applicationName,
          description: spec.name,
          docker_registry_image_name: imageName,
          docker_registry_image_tag: imageTag,
          domains: `https://${spec.domain}`
        })
      })
      return existing.uuid
    }

    const result = await this.request<{ uuid: string }>('/applications/dockerimage', {
      method: 'POST',
      body: JSON.stringify({
        project_uuid: this.config.projectUuid,
        server_uuid: this.config.serverUuid,
        environment_name: this.config.environment,
        docker_registry_image_name: imageName,
        docker_registry_image_tag: imageTag,
        ports_exposes: '3000',
        name: applicationName,
        description: spec.name,
        domains: `https://${spec.domain}`,
        health_check_enabled: true,
        health_check_path: '/api/health',
        health_check_port: '3000',
        health_check_return_code: 200,
        instant_deploy: false,
        force_domain_override: false,
        autogenerate_domain: false
      })
    })
    return result.uuid
  }

  async configure(applicationUuid: string, environment: Record<string, string>) {
    await this.request(`/applications/${applicationUuid}/envs/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: Object.entries(environment).map(([key, value]) => ({ key, value, is_literal: true, is_preview: false }))
      })
    })
  }

  async deploy(applicationUuid: string) {
    const result = await this.request<{ deployments: Array<{ deployment_uuid: string }> }>('/deploy', {
      method: 'POST',
      body: JSON.stringify({ uuid: applicationUuid })
    })
    const uuid = result.deployments[0]?.deployment_uuid
    if (!uuid) {
      throw new Error('Coolify did not return a deployment UUID')
    }
    return uuid
  }

  async stop(applicationUuid: string) {
    await this.request(`/applications/${applicationUuid}/stop`, { method: 'POST' })
  }

  async deploymentStatus(deploymentUuid: string) {
    const result = await this.request<{ status: string }>(`/deployments/${deploymentUuid}`)
    if (['finished', 'success'].includes(result.status)) {
      return 'finished'
    }
    if (['failed', 'cancelled', 'cancelled-by-user'].includes(result.status)) {
      return 'failed'
    }
    if (['in_progress', 'running'].includes(result.status)) {
      return 'running'
    }
    return 'pending'
  }
}
