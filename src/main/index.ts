import {app, ipcMain, BrowserWindow, clipboard, shell, globalShortcut, Notification} from 'electron'
import {mkdirSync, writeFileSync} from 'fs'
import {dirname, join} from 'path'
import {WindowManager} from './windowManager'
import {IrsdkService} from './irsdkService'
import {ConfigStore} from './configStore'
import {OverlayServer} from './overlayServer'
import {OverlaySettingsStore} from './overlaySettingsStore'
import {DriverStatsStore} from './driverStatsStore'
import {checkForUpdate} from './updateChecker'
import {
  IPC,
  overlaySettingsChannel,
  type AnyOverlaySettings,
  type ColorCorrectionMode,
  type ConnectionStatus,
  type OverlayId,
  type OverlayBounds,
  type RelativeOverlaySettings,
  type StandingsOverlaySettings,
  type UpdateStatus,
  type OverlayScreenshotResult
} from '../shared/types'

const windowManager = new WindowManager()
const irsdk = new IrsdkService()
const configStore = new ConfigStore()
const overlayServer = new OverlayServer()
const overlaySettingsStore = new OverlaySettingsStore()
const driverStatsStore = new DriverStatsStore()

let connectionStatus: ConnectionStatus = {connected: false}
let updateStatus: UpdateStatus = {available: false, currentVersion: app.getVersion()}

// Shows the per-overlay screenshot button in the Control Center (when enabled).
// Off by default so the button doesn't clutter normal use.
const screenshotsEnabled = process.env.OVERLAY_SCREENSHOTS === '1'
if (screenshotsEnabled) {
  console.log('[main] OVERLAY_SCREENSHOTS=1 - overlay screenshot buttons enabled')
}

const SCREENSHOTS_DIR = join(process.cwd(), 'media')
const ALL_OVERLAYS_SHORTCUT = 'CommandOrControl+Space'

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function captureOverlayToFile(win: BrowserWindow, filePath: string): Promise<boolean> {
  try {
    const image = await win.webContents.capturePage()
    mkdirSync(dirname(filePath), {recursive: true})
    writeFileSync(filePath, image.toPNG())
    return true
  } catch (err) {
    console.error('Failed to capture overlay screenshot:', err)
    return false
  }
}

// Global-hotkey: Capture screenshots of all visible overlays at once
async function captureAllOverlayScreenshots(): Promise<void> {
  const entries = windowManager.getAllOverlayEntries().filter(({window}) => !window.isDestroyed())
  if (entries.length === 0) return

  const batchDir = join(SCREENSHOTS_DIR, timestampForFilename())
  let successCount = 0
  for (const {id, window} of entries) {
    if (await captureOverlayToFile(window, join(batchDir, `${id}.png`))) successCount++
  }

  new Notification({
    title: 'YAiRO',
    body: `${successCount}/${entries.length} overlay screenshots saved`
  }).show()
}

function broadcastToOverlays(channel: string, payload: unknown): void {
  for (const win of windowManager.getAllOverlayWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  // Mirror the same events to clients connected via browser
  // (see overlayServer.ts + useOverlayBridge.ts in the renderer).
  overlayServer.broadcast(channel, payload)
}

function broadcastToAll(channel: string, payload: unknown): void {
  broadcastToOverlays(channel, payload)
  if (windowManager.controlWindow && !windowManager.controlWindow.isDestroyed()) {
    windowManager.controlWindow.webContents.send(channel, payload)
  }
}

function onOverlayBoundsChanged(id: OverlayId, bounds: OverlayBounds): void {
  const updated = configStore.setOverlay(id, {bounds})
  broadcastToAll(IPC.CONFIG_UPDATED, updated)
}

function createControlWindow(): void {
  windowManager.createControlWindow(configStore.get().controlWindowBounds, (bounds) => {
    configStore.setControlWindowBounds(bounds)
  })
}

function createOverlaysFromConfig(): void {
  const {overlays} = configStore.get()
  for (const overlay of overlays) {
    if (overlay.enabled) {
      windowManager.createOverlayWindow(overlay, onOverlayBoundsChanged)
    }
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.CONFIG_GET, () => configStore.get())

  // Control Center toggles an overlay on/off or changes settings
  ipcMain.handle(IPC.CONFIG_SET_OVERLAY, (_evt, id: OverlayId, patch) => {
    const updated = configStore.setOverlay(id, patch)
    const overlayConfig = updated.overlays.find((o) => o.id === id)

    if (overlayConfig) {
      if (overlayConfig.enabled) {
        windowManager.createOverlayWindow(overlayConfig, onOverlayBoundsChanged)
      } else {
        windowManager.closeOverlayWindow(id)
      }
    }

    broadcastToAll(IPC.CONFIG_UPDATED, updated)
    return updated
  })

  // Toggle edit mode (make overlays draggable)
  ipcMain.handle(IPC.EDIT_MODE_SET, (_evt, enabled: boolean) => {
    const updated = configStore.setEditMode(enabled)
    windowManager.setEditMode(enabled)
    broadcastToAll(IPC.CONFIG_UPDATED, updated)
    return updated
  })

  // Control Center's accent color picker, live-applied to every window.
  ipcMain.handle(IPC.ACCENT_COLOR_SET, (_evt, accentColor: string) => {
    const updated = configStore.setAccentColor(accentColor)
    broadcastToAll(IPC.CONFIG_UPDATED, updated)
    return updated
  })

  // Control Center's colorblind correction dropdown, live-applied to every window.
  ipcMain.handle(IPC.COLOR_CORRECTION_MODE_SET, (_evt, colorCorrectionMode: ColorCorrectionMode) => {
    const updated = configStore.setColorCorrectionMode(colorCorrectionMode)
    broadcastToAll(IPC.CONFIG_UPDATED, updated)
    return updated
  })

  // Overlay reports new position/size after a drag in edit mode
  ipcMain.handle(IPC.OVERLAY_BOUNDS_SET, (_evt, id: OverlayId, bounds: OverlayBounds) => {
    windowManager.setOverlayBounds(id, bounds)
    const updated = configStore.setOverlay(id, {bounds})
    broadcastToAll(IPC.CONFIG_UPDATED, updated)
    return updated
  })

  // Overlay reports its actual content size (auto-fit, or a forced resize
  // after a scale change even in edit mode, see useReportContentSize.ts)
  ipcMain.handle(
    IPC.OVERLAY_CONTENT_SIZE_SET,
    (_evt, id: OverlayId, width: number, height: number, force?: boolean) => {
      windowManager.setOverlayContentSize(id, width, height, force)
    }
  )

  ipcMain.handle(IPC.OVERLAY_SETTINGS_GET, (_evt, id: OverlayId) => overlaySettingsStore.get(id))

  ipcMain.handle(IPC.DRIVER_STATS_GET_ALL, () => driverStatsStore.getAll())

  ipcMain.handle(IPC.CONNECTION_STATUS_GET, () => connectionStatus)

  // Control Center's "copy overlay URL" button. Writes to the OS clipboard
  ipcMain.handle(IPC.CLIPBOARD_WRITE, (_evt, text: string) => {
    clipboard.writeText(text)
  })

  // Query the result of the startup update check (see checkForUpdate() below)
  ipcMain.handle(IPC.UPDATE_STATUS_GET, () => updateStatus)

  // Control Center's update banner link, only ever a release URL under our
  // own repo (comes from the GitHub API response, see updateChecker.ts),
  // but validated again here before handing it to the OS.
  ipcMain.handle(IPC.UPDATE_OPEN_RELEASE, (_evt, url: string) => {
    if (url.startsWith('https://github.com/hyleon-dev/yairo/')) shell.openExternal(url)
  })

  ipcMain.handle(IPC.OVERLAY_SCREENSHOTS_ENABLED_GET, () => screenshotsEnabled)

  // Control Center's per-overlay "Screenshot" button
  ipcMain.handle(IPC.OVERLAY_SCREENSHOT, async (_evt, id: OverlayId): Promise<OverlayScreenshotResult> => {
    if (!screenshotsEnabled) return {success: false}

    const win = windowManager.getOverlayWindow(id)
    if (!win || win.isDestroyed()) return {success: false}

    const path = join(SCREENSHOTS_DIR, `${id}-${timestampForFilename()}.png`)
    const success = await captureOverlayToFile(win, path)
    if (success) shell.showItemInFolder(path)
    return success ? {success: true, path} : {success: false}
  })

  ipcMain.handle(
      IPC.OVERLAY_SETTINGS_SET,
      (_evt, id: OverlayId, patch: Partial<AnyOverlaySettings>) => {
        const updated = overlaySettingsStore.set(id, patch)
        broadcastToOverlays(overlaySettingsChannel(id), updated)

        if (id === 'relative') {
          const relativeSettings = updated as RelativeOverlaySettings
          irsdk.setRelativeWindow(relativeSettings.driversAhead, relativeSettings.driversBehind)
        }

        if (id === 'standings') {
          const standingsSettings = updated as StandingsOverlaySettings
          irsdk.setStandingsWindow(
              standingsSettings.driversAhead,
              standingsSettings.driversBehind,
              standingsSettings.topCount
          )
        }

        return updated
      }
  )
}

// Announce current settings once at startup: to the worker (Relative window
// size) and as a WebSocket snapshot for browser clients that connect
// later, which would otherwise never learn about them
// until the first manual change in the Control Center.
function seedOverlaySettings(): void {
  // So a browser/OBS client connecting before the next config change still
  // gets the persisted accent color instead of theme.css's built-in default
  // (Electron windows don't need this, they fetch getConfig() themselves).
  broadcastToAll(IPC.CONFIG_UPDATED, configStore.get())

  for (const overlay of configStore.get().overlays) {
    broadcastToOverlays(overlaySettingsChannel(overlay.id), overlaySettingsStore.get(overlay.id))
  }

  const relativeSettings = overlaySettingsStore.get('relative') as RelativeOverlaySettings
  irsdk.setRelativeWindow(relativeSettings.driversAhead, relativeSettings.driversBehind)

  const standingsSettings = overlaySettingsStore.get('standings') as StandingsOverlaySettings
  irsdk.setStandingsWindow(
      standingsSettings.driversAhead,
      standingsSettings.driversBehind,
      standingsSettings.topCount
  )
}

function registerIrsdkEvents(): void {
  irsdk.on('telemetry', (data) => {
    broadcastToOverlays(IPC.TELEMETRY_UPDATE, data)
  })
  irsdk.on('standings', (data) => {
    broadcastToOverlays(IPC.STANDINGS_UPDATE, data)
  })
  irsdk.on('relative', (data) => {
    broadcastToOverlays(IPC.RELATIVE_UPDATE, data)
  })
  irsdk.on('trackmap', (data) => {
    broadcastToOverlays(IPC.TRACKMAP_UPDATE, data)
  })
  irsdk.on('flags', (data) => {
    broadcastToOverlays(IPC.FLAGS_UPDATE, data)
  })
  irsdk.on('connected', () => {
    driverStatsStore.expireIfStale()
    connectionStatus = {connected: true}
    broadcastToAll(IPC.CONNECTION_STATUS, connectionStatus)
  })
  irsdk.on('disconnected', () => {
    connectionStatus = {connected: false}
    broadcastToAll(IPC.CONNECTION_STATUS, connectionStatus)
  })
  irsdk.on('lapCompleted', (events) => {
    for (const event of events) {
      driverStatsStore.recordLapTime(event.custId, event.driverName, event.entry)
    }
  })
  irsdk.on('sessionHeartbeat', (sessionTimeRemainSec) => {
    driverStatsStore.updateSessionExpiry(sessionTimeRemainSec)
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  registerIrsdkEvents()

  createControlWindow()
  createOverlaysFromConfig()
  irsdk.start()
  overlayServer.start()
  seedOverlaySettings()

  if (screenshotsEnabled) {
    const registered = globalShortcut.register(ALL_OVERLAYS_SHORTCUT, () => {
      captureAllOverlayScreenshots()
    })
    if (!registered) {
      console.error(`[main] Failed to register global shortcut ${ALL_OVERLAYS_SHORTCUT} - already in use?`)
    }
  }

  // Non-blocking: only updates the banner once/if the GitHub API responds.
  checkForUpdate(app.getVersion()).then((status) => {
    updateStatus = status
    if (windowManager.controlWindow && !windowManager.controlWindow.isDestroyed()) {
      windowManager.controlWindow.webContents.send(IPC.UPDATE_STATUS, updateStatus)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  irsdk.stop()
  overlayServer.stop()
  if (process.platform !== 'darwin') app.quit()
})
