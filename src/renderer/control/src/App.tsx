import { useEffect, useState } from 'react'
import {
  OVERLAY_SERVER_PORT,
  type AnyOverlaySettings,
  type AppConfig,
  type ConnectionStatus,
  type OverlayId
} from '../../../shared/types'
import { messages } from '../../../shared/messages'
import { OverlaySettingsPanel } from './OverlaySettingsPanel'

const m = messages.control

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus>({ connected: false })
  const [settings, setSettings] = useState<Partial<Record<OverlayId, AnyOverlaySettings>>>({})
  const [copiedOverlayId, setCopiedOverlayId] = useState<OverlayId | null>(null)

  useEffect(() => {
    window.overlayApi.getConfig().then(setConfig)
    // Actively query current connection status instead of only waiting
    // for next connected/disconnected event,
    // if iRacing was already running before this window,
    // the worker can connect immediately, and the one-off broadcast would
    // be missed before this listener is registered
    window.overlayApi.getConnectionStatus().then(setConnection)

    const unsubConfig = window.overlayApi.onConfigUpdated(setConfig)
    const unsubConn = window.overlayApi.onConnectionStatus(setConnection)

    return () => {
      unsubConfig()
      unsubConn()
    }
  }, [])

  // Load/watch settings for all overlays once the configuration (and thus
  // the list of overlay ids) is known
  useEffect(() => {
    if (!config) return

    const unsubs = config.overlays.map((overlay) => {
      window.overlayApi
        .getOverlaySettings(overlay.id)
        .then((s) => setSettings((prev) => ({ ...prev, [overlay.id]: s })))
      return window.overlayApi.onOverlaySettings(overlay.id, (s) =>
        setSettings((prev) => ({ ...prev, [overlay.id]: s }))
      )
    })

    return () => unsubs.forEach((unsub) => unsub())
  }, [config?.overlays.map((o) => o.id).join(',')])

  if (!config) return <div className="app">{m.loading}</div>

  const toggleOverlay = (id: string, enabled: boolean) => {
    window.overlayApi.setOverlay(id as never, { enabled })
  }

  const updateOverlaySettings = (id: OverlayId, patch: Partial<AnyOverlaySettings>) => {
    window.overlayApi.setOverlaySettings(id, patch).then((updated) => {
      setSettings((prev) => ({ ...prev, [id]: updated }))
    })
  }

  const toggleEditMode = () => {
    window.overlayApi.setEditMode(!config.editMode)
  }

  const handleCopyUrl = (id: OverlayId) => {
    const url = `http://127.0.0.1:${OVERLAY_SERVER_PORT}/overlays/${id}`
    window.overlayApi.copyToClipboard(url)
    setCopiedOverlayId(id)
    setTimeout(() => setCopiedOverlayId((cur) => (cur === id ? null : cur)), 1500)
  }

  return (
    <div className="app">
      <header>
        <h1>{m.appTitle}</h1>
        <span className={`status ${connection.connected ? 'ok' : 'off'}`}>
          {connection.connected ? m.connected : m.disconnected}
        </span>
      </header>

      <section>
        <h2>{m.overlaysHeading}</h2>
        <ul className="overlay-list">
          {config.overlays.map((overlay) => (

            <li key={overlay.id}>
              <label>
                <input
                  type="checkbox"
                  checked={overlay.enabled}
                  onChange={(e) => toggleOverlay(overlay.id, e.target.checked)}
                />
                {overlay.name}
              </label>
              <button type="button" className="overlay-url-btn" onClick={() => handleCopyUrl(overlay.id)}>
                {copiedOverlayId === overlay.id ? m.overlayUrlCopied : m.overlayUrlCopy}
              </button>
              <OverlaySettingsPanel
                overlay={overlay}
                settings={settings[overlay.id]}
                onChange={(patch) => updateOverlaySettings(overlay.id, patch)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{m.positioningHeading}</h2>
        <button onClick={toggleEditMode}>{config.editMode ? m.editModeExit : m.editModeEnter}</button>
        <p className="hint">{m.editModeHint}</p>
      </section>
    </div>
  )
}
