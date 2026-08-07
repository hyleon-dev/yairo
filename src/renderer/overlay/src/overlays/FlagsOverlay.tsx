import { useEffect, useState } from 'react'
import { FLAG_BITS, type FlagsData, type FlagsOverlaySettings } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import '../overlay-elements.css'
import './FlagsOverlay.css'

const m = messages.flags

const GRID_SIZE = 12 // when editing, change value in CSS too!
const CENTER = (GRID_SIZE - 1) / 2

// `phase` only matters for animated patterns, other patterns simply ignore the extra argument.
type Pattern = (row: number, col: number, phase: number) => boolean

const ALL_ON: Pattern = () => true
// Shifting `phase` by one each animation tick flips every column's parity,
// which reads as the whole board "jumping" one column to the left/right.
const CHECKERED: Pattern = (row, col, phase) => (row + col + phase) % 2 === 0
// Diagonal band (top-left to bottom-right)
const DIAGONAL_BAND: Pattern = (row, col) => Math.abs(row - col) <= 1
// Small, centered disc.
const CENTER_DOT: Pattern = (row, col) => {
  const dx = Math.abs(col - CENTER)
  const dy = Math.abs(row - CENTER)
  return dx <= 2.5 && dy <= 2.5 && !(dx === 2.5 && dy === 2.5)
}
// Alternating vertical bars
const COLUMNS: Pattern = (row, col) => Math.floor(col / 2) % 2 === 0

const CHECKERED_SHIFT_INTERVAL_MS = 720

interface FlagVisual {
  label: string
  onColor: string
  offColor: string
  pattern: Pattern
  blink: boolean
  animated: boolean
  // Black-category flags are easy to miss as a plain dark square,
  // hence the extra border (see CSS) and a per-LED outline.
  alert: boolean
  ledBorder?: string
}

const LED_OFF = 'rgba(255, 255, 255, 0.08)'
const BLACK_FIELD = '#0d0d10'
const BLACK_LED_BORDER = '1px solid rgba(255, 255, 255, 0.5)'

const NONE_VISUAL: FlagVisual = {
  label: m.none,
  onColor: LED_OFF,
  offColor: LED_OFF,
  pattern: () => false,
  blink: false,
  animated: false,
  alert: false
}

// Only one flag is displayed at a time, like a physical flag panel.
// Priority order follows order in code (first flag checked will be displayed before every flag below).
function decodeFlags(flags: number): FlagVisual {
  const has = (bit: number) => (flags & bit) !== 0

  if (has(FLAG_BITS.black) || has(FLAG_BITS.disqualify) || has(FLAG_BITS.furled)) {
    return {
      label: m.black,
      onColor: BLACK_FIELD,
      offColor: BLACK_FIELD,
      pattern: ALL_ON,
      blink: false,
      animated: false,
      alert: true,
      ledBorder: BLACK_LED_BORDER
    }
  }

  if (has(FLAG_BITS.repair)) {
    return {
      label: m.repair,
      onColor: '#e6842a',
      offColor: BLACK_FIELD,
      pattern: CENTER_DOT,
      blink: false,
      animated: false,
      alert: true,
      ledBorder: BLACK_LED_BORDER
    }
  }

  if (has(FLAG_BITS.red)) {
    return { label: m.red, onColor: '#e74c3c', offColor: '#e74c3c', pattern: ALL_ON, blink: false, animated: false, alert: false }
  }

  if (has(FLAG_BITS.checkered)) {
    return {
      label: m.checkered,
      onColor: '#f5f5f5',
      offColor: '#101014',
      pattern: CHECKERED,
      blink: false,
      animated: true,
      alert: false
    }
  }

  if (has(FLAG_BITS.blue)) {
    return {
      label: m.blue,
      onColor: '#f5f5f5',
      offColor: '#3a7dff',
      pattern: DIAGONAL_BAND,
      blink: false,
      animated: false,
      alert: false
    }
  }

  const yellowActive = has(FLAG_BITS.yellow) || has(FLAG_BITS.yellowWaving)
  if (yellowActive) {
    const waving = has(FLAG_BITS.yellowWaving)
    return {
      label: m.yellow,
      onColor: '#f1c40f',
      offColor: '#f1c40f',
      pattern: ALL_ON,
      blink: waving,
      animated: false,
      alert: false
    }
  }

  const cautionActive = has(FLAG_BITS.caution) || has(FLAG_BITS.cautionWaving)
  if (cautionActive) {
    const waving = has(FLAG_BITS.cautionWaving)
    return {
      label: m.caution,
      onColor: '#f1c40f',
      offColor: '#e74c3c',
      pattern: COLUMNS,
      blink: waving,
      animated: false,
      alert: false
    }
  }

  if (has(FLAG_BITS.white)) {
    return { label: m.white, onColor: '#f5f5f5', offColor: '#f5f5f5', pattern: ALL_ON, blink: false, animated: false, alert: false }
  }

  if (has(FLAG_BITS.green) || has(FLAG_BITS.greenHeld)) {
    return { label: m.green, onColor: '#2ecc71', offColor: '#2ecc71', pattern: ALL_ON, blink: false, animated: false, alert: false }
  }

  return NONE_VISUAL
}

export function FlagsOverlay({ data, settings }: { data: FlagsData; settings: FlagsOverlaySettings }) {
  const visual = decodeFlags(data.flags)
  // No flag active: fully transparent (nothing to show), but the panel keeps
  // its normal footprint so it stays visible/draggable in edit mode.
  const isIdle = visual === NONE_VISUAL
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!visual.animated) return
    const id = setInterval(() => setPhase((p) => p + 1), CHECKERED_SHIFT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [visual.animated])

  return (
    <div className={`card flags ${visual.alert ? 'flags--alert' : ''} ${isIdle ? 'flags--idle' : ''}`}>
      <div className={`flags-grid ${visual.blink ? 'flags-grid--blink' : ''}`}>
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
          const on = visual.pattern(Math.floor(i / GRID_SIZE), i % GRID_SIZE, phase)
          const color = on ? visual.onColor : visual.offColor
          return (
            <span
              key={i}
              className="flags-led"
              style={{ background: color, boxShadow: on ? `0 0 4px ${color}` : 'none', border: visual.ledBorder }}
            />
          )
        })}
      </div>
      {settings.showLabel && <div className="flags-label">{visual.label}</div>}
    </div>
  )
}
