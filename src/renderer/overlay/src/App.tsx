import { useEffect } from 'react'
import type {
  AnyOverlaySettings,
  FlagsData,
  FlagsOverlaySettings,
  OverlayId,
  RelativeData,
  RelativeOverlaySettings,
  StandingsData,
  StandingsOverlaySettings,
  TelemetryData,
  TelemetryOverlaySettings,
  TiresOverlaySettings,
  TrackMapData
} from '../../../shared/types'
import { useOverlayBridge } from './useOverlayBridge'
import { useReportContentSize } from './useReportContentSize'
import { TelemetryOverlay } from './overlays/TelemetryOverlay'
import { FuelOverlay } from './overlays/FuelOverlay'
import { LapTimerOverlay } from './overlays/LapTimerOverlay'
import { IncidentsOverlay } from './overlays/IncidentsOverlay'
import { StandingsOverlay } from './overlays/StandingsOverlay'
import { RelativeOverlay } from './overlays/RelativeOverlay'
import { TrackMapOverlay } from './overlays/TrackMapOverlay'
import { TiresOverlay } from './overlays/TiresOverlay'
import { FlagsOverlay } from './overlays/FlagsOverlay'

// Fallback data shown before the first message for this overlay has arrived.
const EMPTY_WHEEL = { wearPct: 0, tempC: 0, tempUnit: 'C' }

const EMPTY_TELEMETRY: TelemetryData = {
  speedKph: 0,
  rpm: 0,
  rpmIdle: 0,
  rpmSLFirst: 0,
  rpmSLShift: 0,
  rpmSLLast: 0,
  rpmSLBlink: 0,
  gear: 0,
  throttlePct: 0,
  brakePct: 0,
  clutchPct: 0,
  fuelLevelL: 0,
  lap: 0,
  lapDistPct: 0,
  isOnTrack: false,
  lapCurrentTime: -1,
  lapLastTime: -1,
  lapBestTime: -1,
  lapDeltaToBest: 0,
  isSpectatingOther: false,
  fuelEstimate: null,
  incidentCount: 0,
  currentDriverIncidentCount: -1,
  teamIncidentCount: -1,
  incidentLimit: '-',
  tires: { lf: EMPTY_WHEEL, rf: EMPTY_WHEEL, lr: EMPTY_WHEEL, rr: EMPTY_WHEEL }
}

const EMPTY_STANDINGS: StandingsData = {
  trackName: '-',
  sessionType: '-',
  remainingTimeSecs: 0,
  airTemp: 0,
  airTempUnit: 'C',
  trackTemp: 0,
  trackTempUnit: 'C',
  grip: '-',
  classes: []
}

const EMPTY_RELATIVE: RelativeData = { drivers: [] }

// trackId -1 = sentinel for "no session data yet", distinct from a real but
// uncalibrated trackId (see TrackMapOverlay.tsx, which only shows its "no
// map available" hint for trackId >= 0).
const EMPTY_TRACKMAP: TrackMapData = { trackId: -1, trackName: '-', drivers: [] }

const EMPTY_FLAGS: FlagsData = { flags: 0 }

function useOverlayId(): OverlayId {
  const params = new URLSearchParams(window.location.search)
  return (params.get('overlay') as OverlayId) ?? 'telemetry'
}

export default function App() {
  const overlayId = useOverlayId()
  const { telemetry, standings, relative, trackMap, flags, editMode, settings } = useOverlayBridge(overlayId)
  const contentRef = useReportContentSize(overlayId, editMode, settings.scale)

  // Overrides both panel-background variants (--panel-bg for most overlays,
  // --panel-bg-light for trackmap) with the same alpha, so
  // this works regardless of which one the current overlay's CSS uses.
  useEffect(() => {
    const rgba = `rgba(var(--color-background-rgb), ${settings.opacity})`
    document.documentElement.style.setProperty('--panel-bg', rgba)
    document.documentElement.style.setProperty('--panel-bg-light', rgba)
  }, [settings.opacity])

  return (
    <div className={`overlay-root ${editMode ? 'edit-mode' : ''}`}>
      {editMode && <div className="edit-label">{overlayId}</div>}
      {
        // "zoom" instead of "transform: scale()", because zoom actually changes the layout size,
        // that's what lets the ResizeObserver in useReportContentSize pick up a scale change.
      }
      <div ref={contentRef} className="overlay-content" style={{ zoom: settings.scale }}>
        {renderOverlayContent(overlayId, telemetry, standings, relative, trackMap, flags, settings)}
      </div>
    </div>
  )
}

// Each overlay lives in its own file under ./overlays,
// this routes into the right one based on ?overlay=<id> query param.
function renderOverlayContent(
  id: OverlayId,
  telemetry: TelemetryData | null,
  standings: StandingsData | null,
  relative: RelativeData | null,
  trackMap: TrackMapData | null,
  flags: FlagsData | null,
  settings: AnyOverlaySettings
) {
  if (id === 'standings') {
    return <StandingsOverlay data={standings ?? EMPTY_STANDINGS} settings={settings as StandingsOverlaySettings} />
  }

  if (id === 'relative') {
    return <RelativeOverlay data={relative ?? EMPTY_RELATIVE} settings={settings as RelativeOverlaySettings} />
  }

  if (id === 'trackmap') {
    return <TrackMapOverlay data={trackMap ?? EMPTY_TRACKMAP} />
  }

  if (id === 'flags') {
    return <FlagsOverlay data={flags ?? EMPTY_FLAGS} settings={settings as FlagsOverlaySettings} />
  }

  // Telemetry/Fuel/Lap-Timer/Incidents/Tires are tied to a car; without one
  // (not connected yet, not in/watching a car, spectating without fuel/tire
  // data) they fall back to zeroed/empty data instead of hiding the overlay.
  const telemetryData = telemetry ?? EMPTY_TELEMETRY

  switch (id) {
    case 'telemetry':
      return <TelemetryOverlay data={telemetryData} settings={settings as TelemetryOverlaySettings} />
    case 'fuel':
      return <FuelOverlay data={telemetryData} />
    case 'lap-timer':
      return <LapTimerOverlay data={telemetryData} />
    case 'incidents':
      return <IncidentsOverlay data={telemetryData} />
    case 'tires':
      return <TiresOverlay data={telemetryData} settings={settings as TiresOverlaySettings} />
    default:
      return null
  }
}
