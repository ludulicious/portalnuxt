import { compareReleaseVersions } from '../../shared/release-policy'

interface PortalReleaseRow {
  version: string
  image_digest: string
  discovered_at: Date
}
export interface PortalRelease {
  version: string
  image: string
  discoveredAt: string
}
const stableVersion = /^v?(\d+)\.(\d+)\.(\d+)$/
export const comparePortalVersions = compareReleaseVersions
export function parsePortalImageLocation(value: string) {
  const location = value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  if (!location.startsWith('ghcr.io/') || location.includes('@') || /:[^/]+$/.test(location)) {
    throw new Error('PORTAL_IMAGE must be an untagged ghcr.io repository location')
  }
  return { location, repository: location.slice('ghcr.io/'.length) }
}
async function githubPackagesToken(repository: string, challenge: string | null) {
  const realm = challenge?.match(/realm="([^"]+)"/)?.[1]
  if (realm !== 'https://ghcr.io/token') {
    throw new Error('Unexpected GHCR authentication endpoint')
  }
  const service = challenge?.match(/service="([^"]+)"/)?.[1] || 'ghcr.io'
  const scope = challenge?.match(/scope="([^"]+)"/)?.[1] || `repository:${repository}:pull`
  const url = new URL(realm)
  url.searchParams.set('service', service)
  url.searchParams.set('scope', scope)
  const config = useRuntimeConfig()
  if (!config.registryUsername || !config.registryToken) {
    throw new Error('GHCR credentials are not configured')
  }
  const authorization = Buffer.from(`${config.registryUsername}:${config.registryToken}`).toString('base64')
  const response = await fetch(url, { headers: { Authorization: `Basic ${authorization}` } })
  if (!response.ok) {
    throw new Error(`GHCR authentication failed (${response.status})`)
  }
  const body = (await response.json()) as { token?: string }
  if (!body.token) {
    throw new Error('GHCR did not return an access token')
  }
  return body.token
}
async function ghcrRequest(repository: string, path: string, init: RequestInit = {}) {
  const url = `https://ghcr.io/v2/${repository}${path}`
  let response = await fetch(url, init)
  if (response.status !== 401) {
    return response
  }
  const token = await githubPackagesToken(repository, response.headers.get('www-authenticate'))
  response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  return response
}
async function digestForTag(repository: string, tag: string) {
  const response = await ghcrRequest(repository, `/manifests/${encodeURIComponent(tag)}`, {
    method: 'HEAD',
    headers: {
      Accept:
        'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'
    }
  })
  if (!response.ok) {
    throw new Error(`Could not resolve portal release ${tag} (${response.status})`)
  }
  const digest = response.headers.get('docker-content-digest')
  if (!digest?.match(/^sha256:[a-f0-9]{64}$/)) {
    throw new Error(`GHCR returned no immutable digest for ${tag}`)
  }
  return digest
}
export async function listPortalReleases(): Promise<PortalRelease[]> {
  const result = await useDatabase().query<PortalReleaseRow>(
    'SELECT version,image_digest,discovered_at FROM portal_release'
  )
  return result.rows
    .map((row) => ({ version: row.version, image: row.image_digest, discoveredAt: row.discovered_at.toISOString() }))
    .sort((a, b) => comparePortalVersions(b.version, a.version))
}
export async function refreshPortalReleases() {
  const { location, repository } = parsePortalImageLocation(String(useRuntimeConfig().portalImage || ''))
  const response = await ghcrRequest(repository, '/tags/list?n=1000')
  if (!response.ok) {
    throw new Error(`Could not list portal releases (${response.status})`)
  }
  const { tags = [] } = (await response.json()) as { tags?: string[] }
  for (const version of tags.filter((tag) => stableVersion.test(tag))) {
    const digest = await digestForTag(repository, version)
    await useDatabase().query(
      `INSERT INTO portal_release (version,image_digest,discovered_at) VALUES ($1,$2,now()) ON CONFLICT (version) DO UPDATE SET image_digest=EXCLUDED.image_digest,discovered_at=now()`,
      [version, `${location}@${digest}`]
    )
  }
  return listPortalReleases()
}
export async function resolvePortalRelease(version = 'latest') {
  let releases = await listPortalReleases()
  const stale = !releases.length || Date.now() - new Date(releases[0]!.discoveredAt).getTime() > 15 * 60 * 1000
  if (stale) {
    releases = await refreshPortalReleases()
  }
  const release = version === 'latest' ? releases[0] : releases.find((item) => item.version === version)
  if (!release) {
    throw createError({
      statusCode: 422,
      statusMessage:
        version === 'latest' ? 'No stable portal release is available' : `Portal release ${version} is unavailable`
    })
  }
  return release
}
