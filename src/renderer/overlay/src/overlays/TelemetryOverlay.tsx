import type { TelemetryData, TelemetryOverlaySettings } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import '../overlay-utils.css'
import './TelemetryOverlay.css'

const m = messages.telemetry

const REV_LED_COUNT = 12

function fmtRPM(rpm: number) {
  return rpm == -1 ? '0' : `${Math.round(rpm)}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

type RevLedStage = 'normal' | 'shift' | 'last'

// Shift-light bar: 0% = rpmIdle, 100% = rpmSLFirst (all LEDs lit)
// Color fill: blue at rpmSLShift, red at rpmSLLast
// LEDs blink at rpmSLBlink
function RevLedBar({ data }: { data: TelemetryData }) {
  const { rpm, rpmIdle, rpmSLFirst, rpmSLShift, rpmSLLast, rpmSLBlink } = data
  const available = rpmIdle >= 0 && rpmSLFirst > rpmIdle

  const pct = available ? clamp01((rpm - rpmIdle) / (rpmSLFirst - rpmIdle)) : 0
  const litCount = Math.round(pct * REV_LED_COUNT)

  let stage: RevLedStage = 'normal'
  if (available && rpmSLLast > 0 && rpm >= rpmSLLast) stage = 'last'
  else if (available && rpmSLShift > 0 && rpm >= rpmSLShift) stage = 'shift'

  const blinking = available && rpmSLBlink > 0 && rpm >= rpmSLBlink

  return (
    <div className={`rev-leds ${blinking ? 'rev-leds--blink' : ''}`}>
      {Array.from({ length: REV_LED_COUNT }, (_, i) => {
        // Once shift/last is reached, EVERY LED lights up
        const lit = stage !== 'normal' || i < litCount
        return <span key={i} className={lit ? `rev-led rev-led--lit rev-led--${stage}` : 'rev-led'} />
      })}
    </div>
  )
}

function PedalBar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="pedal-bar-track">
      <div className={`pedal-bar-fill ${colorClass}`} style={{ width: `${clamp01(pct) * 100}%` }} />
    </div>
  )
}

export function TelemetryOverlay({ data, settings }: { data: TelemetryData; settings: TelemetryOverlaySettings }) {
  return (
    <div className="card telemetry">
      <div className="rev-bar">
        <RevLedBar data={data} />
        {settings.showRpmNumber && <div className="rpm">{fmtRPM(data.rpm)}</div>}
      </div>
      <div className="telemetry-main">
        <div className="pedal-bars">
          <PedalBar pct={data.clutchPct} colorClass="pedal-bar-fill--clutch" />
          <PedalBar pct={data.brakePct} colorClass="pedal-bar-fill--brake" />
          <PedalBar pct={data.throttlePct} colorClass="pedal-bar-fill--throttle" />
        </div>
        <div className="telemetry-numbers">
          <div className="big-number">{Math.round(data.speedKph)}</div>
          <div className="unit">{m.speedUnit}</div>
          <div className="gear">
            {m.gearLabel} {data.gear === 0 ? m.gearNeutral : data.gear === -1 ? m.gearReverse : data.gear}
          </div>
        </div>
      </div>
    </div>
  )
}
