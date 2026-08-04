import { contextBridge, ipcRenderer } from 'electron'
import { IPC, overlaySettingsChannel } from '../shared/types'
import type {
  AnyOverlaySettings,
  AppConfig,
  ConnectionStatus,
  DriverStatsData,
  FlagsData,
  OverlayBounds,
  OverlayId,
  OverlayScreenshotResult,
  RelativeData,
  StandingsData,
  TelemetryData,
  TrackMapData,
  UpdateStatus
} from '../shared/types'

const api = {
  // --- one-off queries ---
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),

  getDriverStats: (): Promise<DriverStatsData> => ipcRenderer.invoke(IPC.DRIVER_STATS_GET_ALL),

  getConnectionStatus: (): Promise<ConnectionStatus> => ipcRenderer.invoke(IPC.CONNECTION_STATUS_GET),

  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_STATUS_GET),

  openReleasePage: (url: string): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_OPEN_RELEASE, url),

  getScreenshotsEnabled: (): Promise<boolean> => ipcRenderer.invoke(IPC.OVERLAY_SCREENSHOTS_ENABLED_GET),

  takeOverlayScreenshot: (id: OverlayId): Promise<OverlayScreenshotResult> =>
    ipcRenderer.invoke(IPC.OVERLAY_SCREENSHOT, id),

  // --- actions from the Control Center ---
  setOverlay: (id: OverlayId, patch: Partial<{ enabled: boolean; bounds: OverlayBounds }>) =>
    ipcRenderer.invoke(IPC.CONFIG_SET_OVERLAY, id, patch),

  setEditMode: (enabled: boolean) => ipcRenderer.invoke(IPC.EDIT_MODE_SET, enabled),

  setAccentColor: (color: string): Promise<AppConfig> => ipcRenderer.invoke(IPC.ACCENT_COLOR_SET, color),

  copyToClipboard: (text: string): Promise<void> => ipcRenderer.invoke(IPC.CLIPBOARD_WRITE, text),

  setOverlayBounds: (id: OverlayId, bounds: OverlayBounds) =>
    ipcRenderer.invoke(IPC.OVERLAY_BOUNDS_SET, id, bounds),

  setOverlayContentSize: (id: OverlayId, width: number, height: number, force?: boolean) =>
    ipcRenderer.invoke(IPC.OVERLAY_CONTENT_SIZE_SET, id, width, height, force),

  getOverlaySettings: (id: OverlayId): Promise<AnyOverlaySettings> =>
    ipcRenderer.invoke(IPC.OVERLAY_SETTINGS_GET, id),

  setOverlaySettings: (id: OverlayId, patch: Partial<AnyOverlaySettings>): Promise<AnyOverlaySettings> =>
    ipcRenderer.invoke(IPC.OVERLAY_SETTINGS_SET, id, patch),

  onOverlaySettings: (id: OverlayId, cb: (settings: AnyOverlaySettings) => void) => {
    const channel = overlaySettingsChannel(id)
    const listener = (_e: Electron.IpcRendererEvent, settings: AnyOverlaySettings) => cb(settings)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // --- subscriptions (return an unsubscribe function) ---
  onTelemetry: (cb: (data: TelemetryData) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: TelemetryData) => cb(data)
    ipcRenderer.on(IPC.TELEMETRY_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC.TELEMETRY_UPDATE, listener)
  },

  onStandings: (cb: (data: StandingsData) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: StandingsData) => cb(data)
    ipcRenderer.on(IPC.STANDINGS_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC.STANDINGS_UPDATE, listener)
  },

  onRelative: (cb: (data: RelativeData) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: RelativeData) => cb(data)
    ipcRenderer.on(IPC.RELATIVE_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC.RELATIVE_UPDATE, listener)
  },

  onTrackMap: (cb: (data: TrackMapData) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: TrackMapData) => cb(data)
    ipcRenderer.on(IPC.TRACKMAP_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC.TRACKMAP_UPDATE, listener)
  },

  onFlags: (cb: (data: FlagsData) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, data: FlagsData) => cb(data)
    ipcRenderer.on(IPC.FLAGS_UPDATE, listener)
    return () => ipcRenderer.removeListener(IPC.FLAGS_UPDATE, listener)
  },

  onConnectionStatus: (cb: (status: ConnectionStatus) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: ConnectionStatus) => cb(status)
    ipcRenderer.on(IPC.CONNECTION_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC.CONNECTION_STATUS, listener)
  },

  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: UpdateStatus) => cb(status)
    ipcRenderer.on(IPC.UPDATE_STATUS, listener)
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, listener)
  },

  onConfigUpdated: (cb: (config: AppConfig) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, config: AppConfig) => cb(config)
    ipcRenderer.on(IPC.CONFIG_UPDATED, listener)
    return () => ipcRenderer.removeListener(IPC.CONFIG_UPDATED, listener)
  }
}

export type OverlayApi = typeof api

contextBridge.exposeInMainWorld('overlayApi', api)
