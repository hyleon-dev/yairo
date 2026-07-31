import { useEffect, useState } from 'react'
import {
  DEFAULT_OVERLAY_SETTINGS,
  IPC,
  overlaySettingsChannel,
  type AnyOverlaySettings,
  type AppConfig,
  type ConnectionStatus,
  type FlagsData,
  type OverlayId,
  type RelativeData,
  type StandingsData,
  type TelemetryData,
  type TrackMapData
} from '../../../shared/types'

export interface OverlayBridgeState {
  telemetry: TelemetryData | null
  standings: StandingsData | null
  relative: RelativeData | null
  trackMap: TrackMapData | null
  flags: FlagsData | null
  editMode: boolean
  settings: AnyOverlaySettings
}

// Overlays run either as Electron BrowserWindow (window.overlayApi via
// contextBridge) or as plain browser page (see overlayServer.ts).
// For a browser page, window.overlayApi doesn't exist, so the data is instead
// pulled via WebSocket. This branch decides once on mount which channel to use.
export function useOverlayBridge(overlayId: OverlayId): OverlayBridgeState {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null)
  const [standings, setStandings] = useState<StandingsData | null>(null)
  const [relative, setRelative] = useState<RelativeData | null>(null)
  const [trackMap, setTrackMap] = useState<TrackMapData | null>(null)
  const [flags, setFlags] = useState<FlagsData | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [settings, setSettings] = useState<AnyOverlaySettings>(DEFAULT_OVERLAY_SETTINGS[overlayId])

  useEffect(() => {
    const setters = { setTelemetry, setStandings, setRelative, setTrackMap, setFlags, setEditMode, setSettings }
    return window.overlayApi
      ? subscribeViaElectron(overlayId, setters)
      : subscribeViaWebSocket(overlayId, setters)
  }, [overlayId])

  return { telemetry, standings, relative, trackMap, flags, editMode, settings }
}

interface Setters {
  setTelemetry: (d: TelemetryData | null) => void
  setStandings: (d: StandingsData | null) => void
  setRelative: (d: RelativeData | null) => void
  setTrackMap: (d: TrackMapData | null) => void
  setFlags: (d: FlagsData | null) => void
  setEditMode: (v: boolean) => void
  setSettings: (s: AnyOverlaySettings) => void
}

function subscribeViaElectron(
  overlayId: OverlayId,
  { setTelemetry, setStandings, setRelative, setTrackMap, setFlags, setEditMode, setSettings }: Setters
): () => void {
  const unsubTelemetry = window.overlayApi.onTelemetry(setTelemetry)
  const unsubStandings = window.overlayApi.onStandings(setStandings)
  const unsubRelative = window.overlayApi.onRelative(setRelative)
  const unsubTrackMap = window.overlayApi.onTrackMap(setTrackMap)
  const unsubFlags = window.overlayApi.onFlags(setFlags)
  const unsubConfig = window.overlayApi.onConfigUpdated((cfg: AppConfig) => setEditMode(cfg.editMode))
  const unsubSettings = window.overlayApi.onOverlaySettings(overlayId, setSettings)
  const unsubConnection = window.overlayApi.onConnectionStatus((status: ConnectionStatus) => {
    if (!status.connected) {
      setTelemetry(null)
      setStandings(null)
      setRelative(null)
      setTrackMap(null)
      setFlags(null)
    }
  })

  window.overlayApi.getConfig().then((cfg) => setEditMode(cfg.editMode))
  window.overlayApi.getOverlaySettings(overlayId).then(setSettings)

  return () => {
    unsubTelemetry()
    unsubStandings()
    unsubRelative()
    unsubTrackMap()
    unsubFlags()
    unsubConfig()
    unsubSettings()
    unsubConnection()
  }
}

function subscribeViaWebSocket(
    overlayId: OverlayId,
    {setTelemetry, setStandings, setRelative, setTrackMap, setFlags, setEditMode, setSettings}: Setters
): () => void {
  // No edit mode/dragging in the browser
  setEditMode(false)

  const settingsChannel = overlaySettingsChannel(overlayId)
  const socket = new WebSocket(`ws://${window.location.host}`)

  socket.addEventListener('message', (event) => {
    const {channel, payload} = JSON.parse(event.data as string) as { channel: string; payload: unknown }
    switch (channel) {
      case IPC.TELEMETRY_UPDATE:
        setTelemetry(payload as TelemetryData)
        break
      case IPC.STANDINGS_UPDATE:
        setStandings(payload as StandingsData)
        break
      case IPC.RELATIVE_UPDATE:
        setRelative(payload as RelativeData)
        break
      case IPC.TRACKMAP_UPDATE:
        setTrackMap(payload as TrackMapData)
        break
      case IPC.FLAGS_UPDATE:
        setFlags(payload as FlagsData)
        break
      case IPC.CONNECTION_STATUS:
        if (!(payload as ConnectionStatus).connected) {
          setTelemetry(null)
          setStandings(null)
          setRelative(null)
          setTrackMap(null)
          setFlags(null)
        }
        break
      case settingsChannel:
        setSettings(payload as AnyOverlaySettings)
        break
    }
  })

  return () => socket.close()
}
