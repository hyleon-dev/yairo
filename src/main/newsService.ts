import { NEWS_BASE_URL, type NewsEntry } from '../shared/types'
import { fetchReleases, isNewerVersion, type Release } from './updateChecker'

const MAX_ENTRIES = 10

// Shape of one entry in index.json on the news branch. Remote data, so every field is checked.
interface NewsIndexEntry {
  id: string
  date: string
  title: string
  file: string
  priority?: 'high' | 'normal'
  // true = button to the latest release. A tag (e.g. "v1.0.0-pre4") = minimum version, see resolveUpdateRelease().
  showUpdate?: boolean | string
  // Inclusive app version range. Lets an entry target only older installs.
  minVersion?: string
  maxVersion?: string
  // ISO date. Entry is hidden after this day.
  expires?: string
}

function isValidEntry(value: unknown): value is NewsIndexEntry {
  const e = value as Partial<NewsIndexEntry> | null
  return (
    typeof e?.id === 'string' &&
    typeof e.date === 'string' &&
    typeof e.title === 'string' &&
    typeof e.file === 'string'
  )
}

function appliesTo(entry: NewsIndexEntry, currentVersion: string, today: string): boolean {
  if (entry.minVersion && isNewerVersion(entry.minVersion, currentVersion)) return false
  if (entry.maxVersion && isNewerVersion(currentVersion, entry.maxVersion)) return false
  if (entry.expires && entry.expires < today) return false
  return true
}

// For a minimum tag: newest full release >= tag, else newest pre-release >= tag.
// So a news can link to "v1.0.0-pre4" first and to "v1.0.0" once that is out.
// No button if the installed version is already that new.
function resolveUpdateRelease(
  entry: NewsIndexEntry,
  currentVersion: string,
  releases: Release[]
): NewsEntry['updateRelease'] {
  if (entry.showUpdate === true) return 'latest'
  const minTag = entry.showUpdate
  if (typeof minTag !== 'string') return undefined

  const candidates = releases
    .filter((r) => !isNewerVersion(minTag, r.tag) && isNewerVersion(r.tag, currentVersion))
    .sort((a, b) => (isNewerVersion(a.tag, b.tag) ? -1 : 1))
  const release = candidates.find((r) => !r.prerelease) ?? candidates[0]
  return release ? { version: release.tag.replace(/^v/, ''), url: release.url } : undefined
}

async function fetchText(path: string): Promise<string | null> {
  const res = await fetch(new URL(path, NEWS_BASE_URL), { headers: { 'User-Agent': 'YAiRO-News' } })
  return res.ok ? res.text() : null
}

// Never throws. Like the update check, news are a non-critical convenience feature.
export async function fetchNews(currentVersion: string, seenIds: readonly string[]): Promise<NewsEntry[]> {
  try {
    const index = JSON.parse((await fetchText('index.json')) ?? '[]') as unknown
    if (!Array.isArray(index)) return []

    const today = new Date().toISOString().slice(0, 10)
    const entries = index
      .filter(isValidEntry)
      .filter((entry) => appliesTo(entry, currentVersion, today))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_ENTRIES)
    const releases = entries.some((entry) => typeof entry.showUpdate === 'string') ? await fetchReleases() : []

    const news = await Promise.all(
      entries.map(async (entry): Promise<NewsEntry | null> => {
        const markdown = await fetchText(entry.file).catch(() => null)
        if (markdown === null) return null
        return {
          id: entry.id,
          date: entry.date,
          title: entry.title,
          priority: entry.priority === 'high' ? 'high' : 'normal',
          updateRelease: resolveUpdateRelease(entry, currentVersion, releases),
          markdown,
          seen: seenIds.includes(entry.id)
        }
      })
    )
    return news.filter((entry): entry is NewsEntry => entry !== null)
  } catch {
    return []
  }
}
