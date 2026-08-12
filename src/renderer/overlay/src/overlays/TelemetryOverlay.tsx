import type { TelemetryData, TelemetryOverlaySettings } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { HintLed } from '../overlay-elements'
import './TelemetryOverlay.css'

const m = messages.telemetry

const REV_LED_COUNT = 12

function fmtRPM(rpm: number) {
  return rpm == -1 ? '0' : `${Math.round(rpm)}`
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

type RevLedStage = 'normal' | 'last' | 'blink'

// Shift-light bar: 0% fill at rpmSLFirst, 100% fill (all LEDs lit) at rpmSLShift.
// Color: green up to rpmSLLast, blue from rpmSLLast, red + blinking from rpmSLBlink.
function RevLedBar({ data }: { data: TelemetryData }) {
  const { rpm, rpmSLFirst, rpmSLShift, rpmSLLast, rpmSLBlink } = data
  const available = rpmSLFirst >= 0 && rpmSLShift > rpmSLFirst

  const pct = available ? clamp01((rpm - rpmSLFirst) / (rpmSLShift - rpmSLFirst)) : 0
  const litCount = Math.round(pct * REV_LED_COUNT)

  let stage: RevLedStage = 'normal'
  if (available && rpmSLBlink > 0 && rpm >= rpmSLBlink) stage = 'blink'
  else if (available && rpmSLLast > 0 && rpm >= rpmSLLast) stage = 'last'

  const blinking = stage === 'blink'

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
        <div className="hint-leds">
          <HintLed label={m.pitLimiterLabel} active={data.pitLimiterActive} color="blue" />
          <HintLed label={m.lowFuelLabel} active={data.lowFuelWarning} color="red" />
        </div>
      </div>
    </div>
  )
}
