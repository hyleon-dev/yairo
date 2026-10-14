import { useLayoutEffect, useRef, useState } from 'react'
import type { TrackMapData, TrackMapDriver, TrackShape } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { TRACK_MAP_SHAPES, TRACK_MAP_VIEW_BOX } from '../trackmaps/registry'
import './TrackMapOverlay.css'

const m = messages.trackmap

interface Dot {
  driver: TrackMapDriver
  x: number
  y: number
}

// Plain circle fallback for tracks not in the bundled dataset, for example a new track.
// This still keeps pit status and spacing visible.
const FALLBACK_VIEW_BOX = '0 0 200 200'
const FALLBACK_CENTER = 100
const FALLBACK_RADIUS = 80

// Marker size relative to the viewBox width, same look as the iRacing maps (1920 wide).
const WORLD_DOT_RADIUS = 20 / 1920
const WORLD_PLAYER_DOT_RADIUS = 34 / 1920
const WORLD_DOT_STROKE = 4 / 1920
const PIT_MASK_ID = 'trackmap-pit-mask'
// Covers any track in world meters, independent of the rotation.
const MASK_EXTENT = 100_000

export function TrackMapOverlay({ data, trackShape }: { data: TrackMapData; trackShape: TrackShape | null }) {
  if (trackShape) return <WorldTrackMap data={data} shape={trackShape} />
  // LMU without a map is in the menu or loading. Its shared memory still holds the old cars there.
  if (data.sim === 'lmu') return <div className="trackmap trackmap--idle" />
  return <SvgTrackMap data={data} />
}

// Outline and car positions both in world coordinates (LMU).
function WorldTrackMap({ data, shape }: { data: TrackMapData; shape: TrackShape }) {
  const viewBoxWidth = Number(shape.viewBox.split(' ')[2]) || 1
  const placed = data.drivers.filter((d) => d.x !== undefined && d.y !== undefined)
  // Player last, so it is drawn on top.
  placed.sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer))

  return (
    <div className="trackmap">
      <svg viewBox={shape.viewBox} className="trackmap-svg">
        <g transform={shape.transform || undefined}>
          {
            // Both lines are translucent. The mask cuts the pit lane where the track lies,
            // so the pit lane runs into the track instead of showing through it.
          }
          <mask id={PIT_MASK_ID} maskUnits="userSpaceOnUse" x={-MASK_EXTENT} y={-MASK_EXTENT} width={2 * MASK_EXTENT} height={2 * MASK_EXTENT}>
            <rect x={-MASK_EXTENT} y={-MASK_EXTENT} width={2 * MASK_EXTENT} height={2 * MASK_EXTENT} fill="white" />
            <path d={shape.trackPath} className="trackmap-outline trackmap-outline--world" style={{ stroke: 'black' }} vectorEffect="non-scaling-stroke" />
          </mask>
          {shape.pitPath && (
            <path
              d={shape.pitPath}
              className="trackmap-outline trackmap-pitlane"
              mask={`url(#${PIT_MASK_ID})`}
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path d={shape.trackPath} className="trackmap-outline trackmap-outline--world" vectorEffect="non-scaling-stroke" />
          {placed.map((driver) => (
            <circle
              key={driver.carIdx}
              cx={driver.x}
              cy={driver.y}
              r={(driver.isPlayer ? WORLD_PLAYER_DOT_RADIUS : WORLD_DOT_RADIUS) * viewBoxWidth}
              className={dotClassName(driver)}
              style={{ fill: driver.classColorHex, strokeWidth: WORLD_DOT_STROKE * viewBoxWidth }}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

function SvgTrackMap({ data }: { data: TrackMapData }) {
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
          // The raw path's arc-length parameter does not start at the start/finish line.
          // It may also run opposite to the direction of travel. Direction and offset are
          // calibrated with the formula from xikxp1/iRaceHUD's TrackMapCanvas.svelte,
          // which uses the same asset format.
          const offsetLapDistPct = (1 + shape.offset + shape.direction * driver.lapDistPct) % 1
          const point = pathEl.getPointAtLength(offsetLapDistPct * totalLength)
          return { driver, x: point.x, y: point.y }
        })
      )
      return
    }

    // No calibration data for this track. Place dots by raw lapDistPct around a circle instead.
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
          // Raw SVG markup from iRacing's own start/finish marker asset.
          // It is already positioned in this same coordinate space.
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
