import type { UpdateStatus } from '../shared/types'

const GITHUB_REPO = 'hyleon-dev/yairo'
const LATEST_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`
const GITHUB_HEADERS = { 'User-Agent': 'YAiRO-UpdateChecker', Accept: 'application/vnd.github+json' }

export interface Release {
  tag: string
  url: string
  prerelease: boolean
}

// Numeric major.minor.patch comparison, then the pre-release suffix (e.g. "1.0.0-pre3").
// A release is newer than its own pre-releases. Missing or non-numeric parts count as 0.
// Good enough for our own "vX.Y.Z[-preN]" tags. No need for a full semver dependency.
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => {
    const [, core = '', pre = ''] = /^v?([^-]*)-?(.*)$/.exec(v) ?? []
    return { parts: core.split('.').map((part) => parseInt(part, 10) || 0), pre }
  }
  const [l, c] = [parse(latest), parse(current)]

  for (let i = 0; i < Math.max(l.parts.length, c.parts.length); i++) {
    const lp = l.parts[i] ?? 0
    const cp = c.parts[i] ?? 0
    if (lp !== cp) return lp > cp
  }
  if (l.pre === c.pre) return false
  if (!l.pre) return true
  if (!c.pre) return false
  return l.pre.localeCompare(c.pre, undefined, { numeric: true }) > 0
}

// Never throws. Offline, rate-limited, or "no release published yet" all
// just mean "no update available". This is a non-critical convenience feature.
export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus> {
  try {
    const res = await fetch(LATEST_RELEASE_URL, { headers: GITHUB_HEADERS })
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

// Newest 30 published releases incl. pre-releases. Empty on any error.
export async function fetchReleases(): Promise<Release[]> {
  try {
    const res = await fetch(RELEASES_URL, { headers: GITHUB_HEADERS })
    if (!res.ok) return []

    const data = (await res.json()) as { tag_name?: string; html_url?: string; prerelease?: boolean }[]
    if (!Array.isArray(data)) return []
    return data
      .filter((r) => typeof r.tag_name === 'string' && typeof r.html_url === 'string')
      .map((r) => ({ tag: r.tag_name!, url: r.html_url!, prerelease: r.prerelease === true }))
  } catch {
    return []
  }
}
