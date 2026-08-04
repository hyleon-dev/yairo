import { useEffect, useState } from 'react'
import {
  OVERLAY_SERVER_PORT,
  type AnyOverlaySettings,
  type AppConfig,
  type ColorCorrectionMode,
  type ConnectionStatus,
  type OverlayId,
  type UpdateStatus
} from '../../../shared/types'
import { hexToRgbTriplet } from '../../../shared/color'
import {
  COLOR_CORRECTION_FILTER_SVG_ID,
  COLOR_CORRECTION_FILTER_SVG_MARKUP,
  colorCorrectionFilterId
} from '../../../shared/colorCorrectionFilters'
import { messages } from '../../../shared/messages'
import { OverlaySettingsPanel } from './OverlaySettingsPanel'
import { AccentColorPopup } from './AccentColorPopup'
import {ToggleSwitch} from "./Elements";

const m = messages.control

// Live-applies an accent color to the Control Center's own CSS variables
// (used both for a persisted config.accentColor and for the picker's preview
// while the user is still choosing).
function previewAccentColor(hex: string): void {
  document.documentElement.style.setProperty('--color-accent', hex)
  document.documentElement.style.setProperty('--color-accent-rgb', hexToRgbTriplet(hex))
}

function applyColorCorrectionMode(mode: ColorCorrectionMode): void {
  if (!document.getElementById(COLOR_CORRECTION_FILTER_SVG_ID)) {
    document.body.insertAdjacentHTML('beforeend', COLOR_CORRECTION_FILTER_SVG_MARKUP)
  }
  document.documentElement.style.filter = mode === 'none' ? '' : `url(#${colorCorrectionFilterId(mode)})`
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus>({ connected: false })
  const [settings, setSettings] = useState<Partial<Record<OverlayId, AnyOverlaySettings>>>({})
  const [copiedOverlayId, setCopiedOverlayId] = useState<OverlayId | null>(null)
  const [screenshotOverlayId, setScreenshotOverlayId] = useState<{ id: OverlayId; ok: boolean } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [screenshotsEnabled, setScreenshotsEnabled] = useState(false)
  const [accentColorPickerOpen, setAccentColorPickerOpen] = useState(false)

  useEffect(() => {
    window.overlayApi.getConfig().then(setConfig)
    // Actively query current connection status instead of only waiting
    // for next connected/disconnected event,
    // if iRacing was already running before this window,
    // the worker can connect immediately, and the one-off broadcast would
    // be missed before this listener is registered
    window.overlayApi.getConnectionStatus().then(setConnection)
    window.overlayApi.getUpdateStatus().then(setUpdateStatus)
    // Set once via OVERLAY_SCREENSHOTS=1 env var at app start (see main/index.ts),
    // doesn't change at runtime, so no subscription needed.
    window.overlayApi.getScreenshotsEnabled().then(setScreenshotsEnabled)

    const unsubConfig = window.overlayApi.onConfigUpdated(setConfig)
    const unsubConn = window.overlayApi.onConnectionStatus(setConnection)
    const unsubUpdate = window.overlayApi.onUpdateStatus(setUpdateStatus)

    return () => {
      unsubConfig()
      unsubConn()
      unsubUpdate()
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

  // Applied live here (not just from the picker popup) so settings persisted
  // in a previous session also take effect on startup.
  useEffect(() => {
    if (!config) return
    previewAccentColor(config.accentColor)
  }, [config?.accentColor])

  useEffect(() => {
    if (!config) return
    applyColorCorrectionMode(config.colorCorrectionMode)
  }, [config?.colorCorrectionMode])

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

  const handleColorCorrectionModeChange = (mode: ColorCorrectionMode) => {
    applyColorCorrectionMode(mode)
    window.overlayApi.setColorCorrectionMode(mode)
  }

  const handleCopyUrl = (id: OverlayId) => {
    const url = `http://127.0.0.1:${OVERLAY_SERVER_PORT}/overlays/${id}`
    window.overlayApi.copyToClipboard(url)
    setCopiedOverlayId(id)
    setTimeout(() => setCopiedOverlayId((cur) => (cur === id ? null : cur)), 1500)
  }

  const handleScreenshot = (id: OverlayId) => {
    window.overlayApi.takeOverlayScreenshot(id).then((result) => {
      setScreenshotOverlayId({ id, ok: result.success })
      setTimeout(() => setScreenshotOverlayId((cur) => (cur?.id === id ? null : cur)), 1500)
    })
  }

  return (
    <div className="app">
      <div className="app-content">
        {updateStatus?.available && (
          <div className="update-banner">
            <span>{m.updateAvailable(updateStatus.latestVersion ?? '')}</span>
            <button
              type="button"
              className="update-banner-link"
              onClick={() => updateStatus.url && window.overlayApi.openReleasePage(updateStatus.url)}
            >
              {m.updateAvailableLink}
            </button>
          </div>
        )}
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
                <div className="overlay-item-header">
                  <ToggleSwitch
                      checked={overlay.enabled}
                      onChange={(checked) => toggleOverlay(overlay.id, checked)}
                      label={overlay.name}
                  />
                  {m.overlayHints[overlay.id] && (
                    <span className="info-hint">
                      <button type="button" className="info-hint-btn" aria-label="Info">
                        ℹ️
                      </button>
                      <textarea className="info-hint-popup">{m.overlayHints[overlay.id]}</textarea>
                    </span>
                  )}
                  <div className="overlay-spacer"></div>
                  <button type="button" className="overlay-in-line-button" onClick={() => handleCopyUrl(overlay.id)}>
                    {copiedOverlayId === overlay.id ? m.overlayUrlCopied : m.overlayUrlCopy}
                  </button>
                  {screenshotsEnabled && (
                    <button type="button" className="overlay-in-line-button" onClick={() => handleScreenshot(overlay.id)}>
                      {screenshotOverlayId?.id === overlay.id
                        ? screenshotOverlayId.ok
                          ? m.overlayScreenshotSaved
                          : m.overlayScreenshotError
                        : m.overlayScreenshot}
                    </button>
                  )}
                </div>

                <OverlaySettingsPanel
                  overlay={overlay}
                  settings={settings[overlay.id]}
                  onChange={(patch) => updateOverlaySettings(overlay.id, patch)}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="app-footer">
        <div className="app-footer-actions">
          <button onClick={toggleEditMode}>{config.editMode ? m.editModeExit : m.editModeEnter}</button>
          <button
            type="button"
            className="accent-color-btn"
            onClick={() => setAccentColorPickerOpen(true)}
            title={m.accentColorBtn}
          >
            <span className="accent-color-swatch" style={{ background: config.accentColor }} />
            {m.accentColorBtn}
          </button>
          <select
            className="color-correction-select"
            value={config.colorCorrectionMode}
            title={m.colorCorrectionLabel}
            aria-label={m.colorCorrectionLabel}
            onChange={(e) => handleColorCorrectionModeChange(e.target.value as ColorCorrectionMode)}
          >
            {(Object.keys(m.colorCorrectionOptions) as ColorCorrectionMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {m.colorCorrectionOptions[mode]}
              </option>
            ))}
          </select>
        </div>
        {updateStatus && <span className="app-version">{m.versionLabel(updateStatus.currentVersion)}</span>}
      </footer>

      {accentColorPickerOpen && (
        <AccentColorPopup
          initialColor={config.accentColor}
          onPreview={(hex) => {
            previewAccentColor(hex)
            window.overlayApi.setAccentColor(hex)
          }}
          onSave={() => setAccentColorPickerOpen(false)}
          onCancel={() => setAccentColorPickerOpen(false)}
        />
      )}
    </div>
  )
}
