import type { TelemetryData, TiresOverlaySettings, TireWheelData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import '../overlay-utils.css'
import './TiresOverlay.css'

const m = messages.tires

const GAUGE_WIDTH = 64
const GAUGE_HEIGHT = 100
const CX = GAUGE_WIDTH / 2
const CY = GAUGE_HEIGHT / 2
const RX = 26
const RY = 46
const CORNER_RADIUS = 12

type Corner = 'lf' | 'rf' | 'lr' | 'rr'

const COLOR_GREEN: [number, number, number] = [46, 204, 113]
const COLOR_YELLOW: [number, number, number] = [241, 196, 15]
const COLOR_DARK: [number, number, number] = [92, 30, 22]
const COLOR_FLAT = 'rgb(15, 15, 15)'

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const lerp = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t)
  return `rgb(${lerp(0)}, ${lerp(1)}, ${lerp(2)})`
}

// Green (full tread) -> yellow (half worn) -> dark red (worn out), like a
// fuel-gauge fill. Flat/0% tires are handled separately in TireGauge below.
function wearColor(pct: number): string {
  if (pct >= 50) return mix(COLOR_YELLOW, COLOR_GREEN, (pct - 50) / 50)
  return mix(COLOR_DARK, COLOR_YELLOW, pct / 50)
}

// Oriented like looking down at the car from above,
// gauges sit at the outer edge of their side,
// temperature towards the middle.
function TireGauge({
  corner,
  wheel,
  showWearPct
}: {
  corner: Corner
  wheel: TireWheelData
  showWearPct: boolean
}) {
  const pct = Math.max(0, Math.min(100, wheel.wearPct))
  const isFlat = wheel.wearPct <= 0
  const fillHeight = (isFlat ? 1 : pct / 100) * RY * 2
  const fillY = CY + RY - fillHeight
  const color = isFlat ? COLOR_FLAT : wearColor(pct)
  const clipId = `tire-clip-${corner}`
  const side = corner[0] === 'l' ? 'left' : 'right'

  return (
    <div className={`tire-cell tire-cell--${side}`}>
      <svg viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`} className="tire-gauge">
        <defs>
          <clipPath id={clipId}>
            <rect x={CX - RX} y={CY - RY} width={RX * 2} height={RY * 2} rx={CORNER_RADIUS} ry={CORNER_RADIUS} />
          </clipPath>
        </defs>
        <rect
          x={CX - RX}
          y={CY - RY}
          width={RX * 2}
          height={RY * 2}
          rx={CORNER_RADIUS}
          ry={CORNER_RADIUS}
          className="tire-gauge-bg"
        />
        <rect x={CX - RX} y={fillY} width={RX * 2} height={fillHeight} fill={color} clipPath={`url(#${clipId})`} />
        <rect
          x={CX - RX}
          y={CY - RY}
          width={RX * 2}
          height={RY * 2}
          rx={CORNER_RADIUS}
          ry={CORNER_RADIUS}
          className="tire-gauge-outline"
        />
        {showWearPct && (
          <text x={CX} y={CY + 5} textAnchor="middle" className="tire-wear-text">
            {Math.round(pct)}%
          </text>
        )}
      </svg>
      <div className="tire-temp">
        {Math.round(wheel.tempC)}
        °{wheel.tempUnit}
      </div>
    </div>
  )
}

export function TiresOverlay({ data, settings }: { data: TelemetryData; settings: TiresOverlaySettings }) {
  return (
    <div className="card tires-grid">
      <TireGauge corner="lf" wheel={data.tires.lf} showWearPct={settings.showWearPct} />
      <TireGauge corner="rf" wheel={data.tires.rf} showWearPct={settings.showWearPct} />
      <TireGauge corner="lr" wheel={data.tires.lr} showWearPct={settings.showWearPct} />
      <TireGauge corner="rr" wheel={data.tires.rr} showWearPct={settings.showWearPct} />
    </div>
  )
}
