import type { TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import './LapTimerOverlay.css'

const m = messages.lapTimer

function fmtTime(secs: number): string {
  if (secs < 0) return '--:--.---'
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

export function LapTimerOverlay({ data }: { data: TelemetryData }) {
  return (
    <div className="lap-timer">
      <div className="lap-row">
        <span className="lap-label">{m.lapLabel}</span>
        <span className="lap-num">{data.lap}</span>
      </div>

      <div className="time-current">{fmtTime(data.lapCurrentTime)}</div>

      {
        // Delta to our own best lap only exists for our own car,
        // no value while spectating, instead of incorrectly showing 0 as "exactly on pace".
      }
      {!data.isSpectatingOther && <DeltaIndicator delta={data.lapDeltaToBest} />}

      <div className="times-row">
        <div className="time-block">
          <span className="time-label">{m.lastLap}</span>
          <span className="time-val">{fmtTime(data.lapLastTime)}</span>
        </div>
        <div className="time-block">
          <span className="time-label">{m.bestLap}</span>
          <span className="time-val time-val--best">{fmtTime(data.lapBestTime)}</span>
        </div>
      </div>

      <div className="fuel-row">
        <span className="fuel-icon">⛽</span>
        <span className="fuel-val">{data.isSpectatingOther ? '–' : `${data.fuelLevelL.toFixed(1)} L`}</span>
        {
          // iRacing doesn't expose other drivers' incidents (-1 = not available).
        }
        <span className="incidents">⚠ {data.incidentCount < 0 ? '–' : `${data.incidentCount}x`}</span>
      </div>
    </div>
  )
}
