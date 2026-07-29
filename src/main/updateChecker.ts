import type { UpdateStatus } from '../shared/types'

const GITHUB_REPO = 'hyleon-dev/yairo'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

// Numeric major.minor.patch comparison, missing/non-numeric parts treated as 0.
// Good enough for our own "vX.Y.Z" tags - no need for a full semver dependency.
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((part) => parseInt(part, 10) || 0)
  const [latestParts, currentParts] = [parse(latest), parse(current)]

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0
    const c = currentParts[i] ?? 0
    if (l !== c) return l > c
  }
  return false
}

// Checks the GitHub repo's latest release against the running app version.
// Never throws - offline, rate-limited, or "no release published yet" all
// just mean "no update available", this is a non-critical convenience feature.
export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus> {
  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: { 'User-Agent': 'YAiRO-UpdateChecker', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return { available: false, currentVersion }

    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    if (!data.tag_name || !data.html_url) return { available: false, currentVersion }

    const latestVersion = data.tag_name.replace(/^v/, '')
    return {
      available: isNewerVersion(latestVersion, currentVersion),
      currentVersion,
      latestVersion,
      url: data.html_url
    }
  } catch {
    return { available: false, currentVersion }
  }
}
