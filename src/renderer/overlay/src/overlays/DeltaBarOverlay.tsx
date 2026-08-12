import type { DeltaBarOverlaySettings, TelemetryData } from '../../../../shared/types'
import { computeLapDelta, isLapDeltaValid } from '../lapDelta'
import './DeltaBarOverlay.css'

// Bar's full extent in each direction from center, in seconds.
const MAX_DELTA_SEC = 9.99

export function DeltaBarOverlay(
  { data, settings, targetLapTimeSec }: { data: TelemetryData; settings: DeltaBarOverlaySettings; targetLapTimeSec: number }
) {
  const showDelta = isLapDeltaValid(data, targetLapTimeSec)
  const delta = showDelta ? computeLapDelta(data, targetLapTimeSec) : 0
  const fillPct = Math.min(Math.abs(delta), MAX_DELTA_SEC) / MAX_DELTA_SEC * 100
  const faster = delta < 0

  return (
    <div className="delta-bar">
      <div className="delta-bar-track" style={{ width: settings.barWidthPx }}>
        <div
          className={`delta-bar-fill ${faster ? 'delta-bar-fill--fast' : 'delta-bar-fill--slow'}`}
          style={faster ? { right: '50%', width: `${fillPct / 2}%` } : { left: '50%', width: `${fillPct / 2}%` }}
        />
        <div className="delta-bar-center" />
      </div>
      {settings.showDeltaNumber && showDelta && (
        <div className={`delta-bar-number ${faster ? 'delta-bar-number--fast' : 'delta-bar-number--slow'}`}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(2)}
        </div>
      )}
    </div>
  )
}
