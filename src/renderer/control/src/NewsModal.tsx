import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'
import { NEWS_BASE_URL, type NewsEntry, type UpdateStatus } from '../../../shared/types'
import { messages } from '../../../shared/messages'

const m = messages.news

// Relative paths in a news file point to other files on the news branch.
function resolveNewsUrl(url: string): string {
  const safe = defaultUrlTransform(url)
  return safe ? new URL(safe, NEWS_BASE_URL).href : ''
}

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href) window.overlayApi.openNewsLink(href)
      }}
    >
      {children}
    </a>
  )
}

// 'latest' only gets a button if the update check found a newer release.
function resolveRelease(entry: NewsEntry, updateStatus: UpdateStatus | null): { version: string; url: string } | null {
  if (entry.updateRelease !== 'latest') return entry.updateRelease ?? null
  if (!updateStatus?.available || !updateStatus.url) return null
  return { version: updateStatus.latestVersion ?? '', url: updateStatus.url }
}

interface Props {
  entries: NewsEntry[]
  updateStatus: UpdateStatus | null
  onClose: () => void
}

export function NewsModal({ entries, updateStatus, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal news-modal" onClick={(e) => e.stopPropagation()}>
        <div className="news-modal-entries">
          {entries.map((entry) => {
            const release = resolveRelease(entry, updateStatus)
            return (
            <article key={entry.id} className="news-entry">
              <h3>{entry.title}</h3>
              <time className="news-entry-date">{new Date(entry.date).toLocaleDateString()}</time>
              <div className="news-entry-body">
                <Markdown urlTransform={resolveNewsUrl} components={markdownComponents}>
                  {entry.markdown}
                </Markdown>
              </div>
              {release && (
                <button type="button" onClick={() => window.overlayApi.openReleasePage(release.url)}>
                  {m.update(release.version)}
                </button>
              )}
            </article>
            )
          })}
        </div>

        <div className="news-modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>
            {m.close}
          </button>
        </div>
      </div>
    </div>
  )
}
