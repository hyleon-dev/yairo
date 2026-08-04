import type { LapTimerOverlaySettings, TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import './LapTimerOverlay.css'

const m = messages.lapTimer

function fmtTime(secs: number): string {
  if (secs <= 0) return '--:--.---'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

function DeltaIndicator({ delta }: { delta: number }) {
  const sign = delta > 0 ? '+' : ''
  const cls = delta > 0 ? 'delta--slow' : 'delta--fast'
  return (
    <div className={`delta ${cls}`}>
      {sign}
      {delta.toFixed(3)}
    </div>
  )
}

// for delta to best lap: data.lapDeltaToBest straight from iRacing's own LapDeltaToBestLap SDK value.
// for delta to target lap: where we'd be right now if pacing the target exactly
// (targetLapTimeSec * lapDistPct), vs where we actually are.
function computeDelta(data: TelemetryData, settings: LapTimerOverlaySettings): number {
  if (settings.targetLapTimeSec <= 0) return data.lapDeltaToBest
  const currentTime = data.lapCurrentTime >= 0 ? data.lapCurrentTime : 0
  return currentTime - settings.targetLapTimeSec * data.lapDistPct
}

export function LapTimerOverlay({ data, settings }: { data: TelemetryData; settings: LapTimerOverlaySettings }) {
  const useTargetLap = settings.targetLapTimeSec > 0
  // Without a target, we depend on the SDK's own delta, which isn't valid
  // right after a new best lap (see lapDeltaToBestValid's doc comment) - hide
  // it rather than showing a misleading "+0.000" during that window.
  const showDelta = !data.isSpectatingOther && (useTargetLap || data.lapDeltaToBestValid)
  return (
    <div className="lap-timer">
      <div className="lap-row">
        <span className="lap-label">{m.lapLabel}</span>
        <span className="lap-num">{data.lap}</span>
      </div>

      <div className="time-current">{fmtTime(data.lapCurrentTime)}</div>

      {
        // Delta to our own best lap (or target, once set) only exists for our
        // own car, no value while spectating, instead of incorrectly showing
        // 0 as "exactly on pace".
      }
      {showDelta && <DeltaIndicator delta={computeDelta(data, settings)} />}

      <div className="times-row">
        <div className="time-block">
          <span className="time-label">{m.lastLap}</span>
          <span className="time-val">{fmtTime(data.lapLastTime)}</span>
        </div>
        <div className={`time-block ${!useTargetLap ? 'delta-target' : ''}`}>
          <span className="time-label">{m.bestLap}</span>
          <span className="time-val time-val--best">{fmtTime(data.lapBestTime)}</span>
        </div>
        {useTargetLap && !data.isSpectatingOther && (
          <div className={`time-block ${useTargetLap ? 'delta-target' : ''}`}>
            <span className="time-label">{m.targetLap}</span>
            <span className="time-val time-val--target">{fmtTime(settings.targetLapTimeSec)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
