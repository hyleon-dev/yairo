import type { DamageData, DamageLevel, TelemetryData, WheelDamage } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import './DamageOverlay.css'

const m = messages.damage

// Grid around the car seen from above, front at the top.
const ZONE_LAYOUT: { zone: keyof DamageData['body']; area: string }[] = [
  { zone: 'frontLeft', area: 'fl' },
  { zone: 'front', area: 'f' },
  { zone: 'frontRight', area: 'fr' },
  { zone: 'left', area: 'l' },
  { zone: 'right', area: 'r' },
  { zone: 'rearLeft', area: 'rl' },
  { zone: 'rear', area: 'b' },
  { zone: 'rearRight', area: 'rr' }
]

const WHEELS: (keyof DamageData['wheels'])[] = ['lf', 'rf', 'lr', 'rr']

function Zone({ area, level }: { area: string; level: DamageLevel }) {
  return <span className={`damage-zone damage-zone--${level}`} style={{ gridArea: area }} />
}

function Wheel({ state }: { state: WheelDamage }) {
  return <span className={`damage-wheel damage-wheel--${state}`}>{state === 'detached' ? '✕' : ''}</span>
}

export function DamageOverlay({ data }: { data: TelemetryData }) {
  const damage = data.damage

  return (
    <div className={`card damage ${damage ? '' : 'damage--idle'}`}>
      <div className="damage-grid">
        {ZONE_LAYOUT.map(({ zone, area }) => (
          <Zone key={zone} area={area} level={damage?.body[zone] ?? 0} />
        ))}
        <div className="damage-car" style={{ gridArea: 'c' }}>
          {WHEELS.map((wheel) => (
            <Wheel key={wheel} state={damage?.wheels[wheel] ?? 'ok'} />
          ))}
        </div>
      </div>
      <div className="damage-warnings">
        {damage?.overheating && <span className="damage-warning">{m.overheating}</span>}
        {damage?.partsDetached && <span className="damage-warning">{m.partsDetached}</span>}
      </div>
    </div>
  )
}
