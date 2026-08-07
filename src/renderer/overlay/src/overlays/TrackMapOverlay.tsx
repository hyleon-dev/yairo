import { useLayoutEffect, useRef, useState } from 'react'
import type { TrackMapData, TrackMapDriver } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { TRACK_MAP_SHAPES, TRACK_MAP_VIEW_BOX } from '../trackmaps/registry'
import './TrackMapOverlay.css'

const m = messages.trackmap

interface Dot {
  driver: TrackMapDriver
  x: number
  y: number
}

// Plain circle fallback for tracks not in the bundled dataset (e.g. a new track), just to keep pit-status/spacing visible.
const FALLBACK_VIEW_BOX = '0 0 200 200'
const FALLBACK_CENTER = 100
const FALLBACK_RADIUS = 80

export function TrackMapOverlay({ data }: { data: TrackMapData }) {
  const pathRef = useRef<SVGPathElement>(null)
  const [dots, setDots] = useState<Dot[]>([])
  const shape = TRACK_MAP_SHAPES[String(data.trackId)]

  useLayoutEffect(() => {
    if (shape) {
      const pathEl = pathRef.current
      if (!pathEl) return

      const totalLength = pathEl.getTotalLength()
      setDots(
        data.drivers.map((driver) => {
          // The raw path's own arc-length parameterization doesn't start at the start/finish line
          // and may run opposite to the direction of travel, direction/offset calibrated with
          // formula used by xikxp1/iRaceHUD's TrackMapCanvas.svelte against the same asset format.
          const offsetLapDistPct = (1 + shape.offset + shape.direction * driver.lapDistPct) % 1
          const point = pathEl.getPointAtLength(offsetLapDistPct * totalLength)
          return { driver, x: point.x, y: point.y }
        })
      )
      return
    }

    // No calibration data for this track, place dots by raw lapDistPct around a circle instead
    setDots(
      data.drivers.map((driver) => {
        const angle = driver.lapDistPct * Math.PI * 2 - Math.PI / 2
        return {
          driver,
          x: FALLBACK_CENTER + FALLBACK_RADIUS * Math.cos(angle),
          y: FALLBACK_CENTER + FALLBACK_RADIUS * Math.sin(angle)
        }
      })
    )
  }, [data, shape])

  if (!shape) {
    return (
      <div className="trackmap trackmap--fallback">
        <svg viewBox={FALLBACK_VIEW_BOX} className="trackmap-svg">
          <circle
            cx={FALLBACK_CENTER}
            cy={FALLBACK_CENTER}
            r={FALLBACK_RADIUS}
            className="trackmap-outline trackmap-outline--fallback"
          />
          {dots.map(({ driver, x, y }) => (
            <circle
              key={driver.carIdx}
              cx={x}
              cy={y}
              r={driver.isPlayer ? 8 : 6}
              className={dotClassName(driver)}
              style={{ fill: driver.classColorHex }}
            />
          ))}
        </svg>
        {
          // trackId -1 = no session data yet (see App.tsx's EMPTY_TRACKMAP).
        }
        {data.trackId >= 0 && (
          <div className="trackmap-fallback-label">{m.noMapAvailable(data.trackName, data.trackId)}</div>
        )}
      </div>
    )
  }

  return (
    <div className="trackmap">
      <svg viewBox={TRACK_MAP_VIEW_BOX} className="trackmap-svg">
        <path ref={pathRef} d={shape.path} className="trackmap-outline" />
        {
          // Raw SVG markup from iRacing's own start/finish marker asset,
          // already positioned in this same coordinate space.
        }
        {shape.startFinishMarkup && (
          <g className="trackmap-start-finish" dangerouslySetInnerHTML={{ __html: shape.startFinishMarkup }} />
        )}
        {dots.map(({ driver, x, y }) => (
          <circle
            key={driver.carIdx}
            cx={x}
            cy={y}
            r={driver.isPlayer ? 34 : 20}
            className={dotClassName(driver)}
            style={{ fill: driver.classColorHex }}
          />
        ))}
      </svg>
    </div>
  )
}

function dotClassName(driver: TrackMapDriver): string {
  const classes = ['trackmap-marker']
  if (driver.isPlayer) classes.push('trackmap-marker--player')
  if (driver.surface === 'in-pit-stall' || driver.surface === 'approaching-pits') {
    classes.push('trackmap-marker--pit')
  }
  return classes.join(' ')
}
