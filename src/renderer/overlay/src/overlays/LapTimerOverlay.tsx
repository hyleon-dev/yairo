import type { TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { computeLapDelta, isLapDeltaValid } from '../lapDelta'
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

export function LapTimerOverlay({ data, targetLapTimeSec }: { data: TelemetryData; targetLapTimeSec: number }) {
  const useTargetLap = targetLapTimeSec > 0
  const showDelta = isLapDeltaValid(data, targetLapTimeSec)
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
      {showDelta && <DeltaIndicator delta={computeLapDelta(data, targetLapTimeSec)} />}

      <div className="times-row">
        <div className="time-block">
          <span className="time-label">{m.lastLap}</span>
          <span className={`time-val ${(data.lapLastTime != -1 && data.lapLastTime == data.lapBestTime) ? 'time-val--best' : ''}`}>{fmtTime(data.lapLastTime)}</span>
        </div>
        <div className={`time-block ${!useTargetLap ? 'delta-target' : ''}`}>
          <span className="time-label">{m.bestLap}</span>
          <span className="time-val time-val--best">{fmtTime(data.lapBestTime)}</span>
        </div>
        {useTargetLap && !data.isSpectatingOther && (
          <div className={`time-block ${useTargetLap ? 'delta-target' : ''}`}>
            <span className="time-label">{m.targetLap}</span>
            <span className="time-val time-val--target">{fmtTime(targetLapTimeSec)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
