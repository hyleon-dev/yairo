import type { TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import './IncidentsOverlay.css'

const m = messages.incidents

function fmtCount(count: number): string {
  return count < 0 ? '–' : `${count}x`
}

// WeekendInfo.IncidentLimit is a raw string like "17x" or "unlimited"
function parseLimit(limit: string): number | null {
  const match = limit.match(/\d+/)
  return match ? Number(match[0]) : null
}

function fmtLimit(limit: string): string {
  if (!limit) return '–'
  if (limit.toLowerCase() === 'unlimited') return m.unlimited
  const parsed = parseLimit(limit)
  return parsed !== null ? `${parsed}x` : limit
}

function isAtOrOverLimit(count: number, limit: string): boolean {
  const parsed = parseLimit(limit)
  return parsed !== null && count >= 0 && count >= parsed
}

export function IncidentsOverlay({ data }: { data: TelemetryData }) {
  const driverOver = isAtOrOverLimit(data.currentDriverIncidentCount, data.incidentLimit)
  const teamOver = isAtOrOverLimit(data.teamIncidentCount, data.incidentLimit)

  return (
    <div className="incidents">
      <div className="incidents-block">
        <span className="incidents-label">{m.driver}</span>
        <span className={`incidents-val ${driverOver ? 'incidents-val--over' : ''}`}>
          {fmtCount(data.currentDriverIncidentCount)}
        </span>
      </div>
      <div className="incidents-block">
        <span className="incidents-label">{m.team}</span>
        <span className={`incidents-val ${teamOver ? 'incidents-val--over' : ''}`}>
          {fmtCount(data.teamIncidentCount)}
        </span>
      </div>
      <div className="incidents-block">
        <span className="incidents-label">{m.limit}</span>
        <span className="incidents-val incidents-val--limit">{fmtLimit(data.incidentLimit)}</span>
      </div>
    </div>
  )
}
