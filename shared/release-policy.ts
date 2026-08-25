const stableVersion = /^v?(\d+)\.(\d+)\.(\d+)$/

function versionParts(version: string) {
  return stableVersion.exec(version)?.slice(1).map(Number) ?? null
}

export function compareReleaseVersions(left: string, right: string) {
  const a = versionParts(left)
  const b = versionParts(right)
  if (!a || !b) {
    return left.localeCompare(right)
  }
  return a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!
}

export function isReleaseTransitionAllowed(
  deployedVersion: string | null,
  targetVersion: string,
  availableVersions: string[]
) {
  if (!deployedVersion || compareReleaseVersions(targetVersion, deployedVersion) >= 0) {
    return true
  }

  const orderedVersions = [...new Set(availableVersions)].sort(compareReleaseVersions)
  const deployedIndex = orderedVersions.indexOf(deployedVersion)
  const targetIndex = orderedVersions.indexOf(targetVersion)
  return deployedIndex > 0 && targetIndex === deployedIndex - 1
}
