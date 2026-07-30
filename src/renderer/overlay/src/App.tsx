import type {
  AnyOverlaySettings,
  OverlayId,
  RelativeData,
  RelativeOverlaySettings,
  StandingsData,
  StandingsOverlaySettings,
  TelemetryData,
  TiresOverlaySettings,
  TrackMapData
} from '../../../shared/types'
import { messages } from '../../../shared/messages'
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

const m = messages.overlayApp

function useOverlayId(): OverlayId {
  const params = new URLSearchParams(window.location.search)
  return (params.get('overlay') as OverlayId) ?? 'telemetry'
}

export default function App() {
  const overlayId = useOverlayId()
  const { telemetry, standings, relative, trackMap, editMode, settings } = useOverlayBridge(overlayId)
  const contentRef = useReportContentSize(overlayId, editMode, settings.scale)

  return (
    <div className={`overlay-root ${editMode ? 'edit-mode' : ''}`}>
      {editMode && <div className="edit-label">{overlayId}</div>}
      {
        // "zoom" instead of "transform: scale()", because zoom actually changes the layout size,
        // that's what lets the ResizeObserver in useReportContentSize pick up a scale change.
      }
      <div ref={contentRef} className="overlay-content" style={{ zoom: settings.scale }}>
        {renderOverlayContent(overlayId, telemetry, standings, relative, trackMap, settings)}
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
  settings: AnyOverlaySettings
) {
  if (id === 'standings') {
    if (!standings || standings.classes.length === 0) {
      return <div className="waiting">{m.waitingForSession}</div>
    }
    return <StandingsOverlay data={standings} settings={settings as StandingsOverlaySettings} />
  }

  if (id === 'relative') {
    if (!relative || relative.drivers.length === 0) {
      return <div className="waiting">{m.waitingForSession}</div>
    }
    return <RelativeOverlay data={relative} settings={settings as RelativeOverlaySettings} />
  }

  if (id === 'trackmap') {
    if (!trackMap) {
      return <div className="waiting">{m.waitingForSession}</div>
    }
    return <TrackMapOverlay data={trackMap} />
  }

  if (!telemetry) {
    return <div className="waiting">{m.waitingForIracing}</div>
  }

  // Telemetry/Fuel/Lap-Timer are tied to a car; when neither player car
  // nor (while spectating) a watched car is present, this would just show zeros.
  if (!telemetry.isOnTrack) {
    return <div className="waiting">{m.noActiveCar}</div>
  }

  // Fuel level and tire wear/temp aren't available when spectating others (not our own) cars.
  if ((id === 'fuel' || id === 'tires') && telemetry.isSpectatingOther) {
    return <div className="waiting">{m.notAvailableSpectating}</div>
  }

  switch (id) {
    case 'telemetry':
      return <TelemetryOverlay data={telemetry} />
    case 'fuel':
      return <FuelOverlay data={telemetry} />
    case 'lap-timer':
      return <LapTimerOverlay data={telemetry} />
    case 'incidents':
      return <IncidentsOverlay data={telemetry} />
    case 'tires':
      return <TiresOverlay data={telemetry} settings={settings as TiresOverlaySettings} />
    default:
      return null
  }
}
