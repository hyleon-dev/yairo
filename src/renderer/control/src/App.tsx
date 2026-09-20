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
import { OverlaySettingsPanel, TargetLapTimeInputs } from './OverlaySettingsPanel'
import { AccentColorPopup } from './AccentColorPopup'
import {InfoHint, ToggleSwitch} from "./Elements";
import {Camera, Check, Link, X} from "lucide-react";

const m = messages.control

// Applies an accent color live to the Control Center's own CSS variables.
// Used for the saved config.accentColor and for the picker's live preview.
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
    // Query the current connection status once at start.
    // Do not just wait for the next connected/disconnected event.
    // iRacing may already be running when this window opens.
    // Then the worker connects right away, before this listener is registered,
    // and the one-off broadcast would be missed.
    window.overlayApi.getConnectionStatus().then(setConnection)
    window.overlayApi.getUpdateStatus().then(setUpdateStatus)
    // Set once via OVERLAY_SCREENSHOTS=1 env var at app start (see main/index.ts).
    // Does not change at runtime, so no subscription is needed.
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

  // Load and watch settings for all overlays once the config is known.
  // The config holds the list of overlay ids.
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

  // Applied live here too, not just from the picker popup.
  // This way settings saved in an earlier session also take effect on startup.
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

  const handleTargetLapTimeChange = (targetLapTimeSec: number) => {
    window.overlayApi.setTargetLapTimeSec(targetLapTimeSec)
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
          <h2>{m.targetTimeHeader}</h2>

          <TargetLapTimeInputs
              targetLapTimeSec={config.targetLapTimeSec}
              onChange={handleTargetLapTimeChange}
          />
        </section>

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
                  {m.overlayHints[overlay.id] && <InfoHint text={m.overlayHints[overlay.id]!}/>}
                  <div className="overlay-spacer"></div>
                  <button type="button" className="overlay-in-line-button" onClick={() => handleCopyUrl(overlay.id)}>
                    {copiedOverlayId === overlay.id ? <Check style={{ color: 'var(--color-success)' }} /> : <Link />}
                  </button>
                  {screenshotsEnabled && (
                    <button type="button" className="overlay-in-line-button" onClick={() => handleScreenshot(overlay.id)}>
                      {screenshotOverlayId?.id === overlay.id
                        ? screenshotOverlayId.ok
                          ? <Check style={{ color: 'var(--color-success)' }} />
                          : <X style={{ color: 'var(--color-danger)' }}  />
                        : <Camera />}
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
