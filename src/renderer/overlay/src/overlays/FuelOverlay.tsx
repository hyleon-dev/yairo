import type { FuelLapEstimate, TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import '../overlay-utils.css'
import './FuelOverlay.css'

const m = messages.fuel

function FuelMatrixRow({ label, estimate }: { label: string; estimate: FuelLapEstimate | null }) {
  return (
    <tr>
      <td className="fuel-matrix-label">{label}</td>
      <td>{estimate ? `${estimate.consumptionPerLapL.toFixed(2)} l` : '–'}</td>
      <td>{estimate ? `L${estimate.pitByLap}` : '–'}</td>
      <td>{estimate ? `${estimate.marginLiters.toFixed(2)} l` : '–'}</td>
    </tr>
  )
}

export function FuelOverlay({ data }: { data: TelemetryData }) {
  const lapsRemaining = data.fuelEstimate?.lastLap?.lapsRemaining

  return (
    <div className="card fuel">
      <div className="big-number small">{data.fuelLevelL.toFixed(2)}</div>
      <div className="unit">{m.unit}</div>

      {
      // Range estimate based on the last completed lap.
      // null until a full lap with known consumption has been driven.
      }
      <div className="fuel-laps-remaining">
        {lapsRemaining !== undefined ? m.lapsRemaining(lapsRemaining) : m.rangeUnknown}
      </div>

      <table className="fuel-matrix">
        <thead>
          <tr>
            <th></th>
            <th>{m.columnConsumption}</th>
            <th>{m.columnPitBy}</th>
            <th>{m.columnMargin}</th>
          </tr>
        </thead>
        <tbody>
          <FuelMatrixRow label={m.rowLastLap} estimate={data.fuelEstimate?.lastLap ?? null} />
          <FuelMatrixRow label={m.rowAvg5} estimate={data.fuelEstimate?.avgLast5 ?? null} />
        </tbody>
      </table>
    </div>
  )
}
