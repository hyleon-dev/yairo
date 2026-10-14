import { useRef, type KeyboardEvent } from 'react'
import { SIMULATOR_IDS, type SimulatorId } from '../../../shared/types'
import { messages } from '../../../shared/messages'

const m = messages.control

interface Props {
  value: SimulatorId
  connected: boolean
  needsSetup: boolean
  onChange: (simulator: SimulatorId) => void
}

// One tile per sim. Radio group semantics, arrow keys move the selection.
export function SimulatorPicker({ value, connected, needsSetup, onChange }: Props) {
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + SIMULATOR_IDS.length) % SIMULATOR_IDS.length
    tileRefs.current[next]?.focus()
    onChange(SIMULATOR_IDS[next])
  }

  return (
    <div className="sim-picker" role="radiogroup" aria-label={m.simulatorHeading}>
      {SIMULATOR_IDS.map((id, index) => {
        const active = id === value
        const sim = m.simulators[id]
        const status = !active ? m.simulatorInactive : connected ? m.simulatorConnected : m.simulatorWaiting
        return (
          <button
            key={id}
            ref={(el) => {
              tileRefs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={`sim-tile${active ? ' active' : ''}`}
            onClick={() => onChange(id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span className="sim-tile-mark">{sim.mark}</span>
            <span className="sim-tile-name">{sim.name}</span>
            <span className={`sim-tile-status${active && connected ? ' ok' : ''}`}>
              {active && connected ? '● ' : '○ '}
              {status}
            </span>
            {active && needsSetup && sim.setupHint && <span className="sim-tile-hint">{sim.setupHint}</span>}
          </button>
        )
      })}
    </div>
  )
}
