import type { TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import '../overlay-elements.css'
import './FuelOverlay.css'

const m = messages.fuel

function FuelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="fuel-stat">
      <span className="fuel-stat-label">{label}</span>
      <span className="fuel-stat-val">{value}</span>
    </div>
  )
}

export function FuelOverlay({ data }: { data: TelemetryData }) {
  const lastLap = data.fuelEstimate?.lastLap ?? null
  const avgLast5 = data.fuelEstimate?.avgLast5 ?? null
  const nextPitFuelL = data.fuelEstimate?.nextPitFuelL ?? null
  const stopsRemaining = data.fuelEstimate?.stopsRemaining ?? null

  return (
    <div className="card fuel">
      <div className="fuel-liters-remaining">
        <div className="big-number small">{data.fuelLevelL.toFixed(2)}</div>
        <div className="unit">{m.unit}</div>
      </div>

      <div className="fuel-laps-remaining">
        {lastLap ? m.lapsRemaining(lastLap.lapsRemaining) : m.rangeUnknown}
      </div>

      <div className="fuel-stats-row" style={{ flexDirection: 'column', gap: '0' }}>
        <label style={{ fontSize: 'var(--font-md)' }}>
          {m.consumptionLabel}
        </label>
        <div className="fuel-stats-row" style={{ border: '0', paddingTop: '0' }}>
          <FuelStat
              label={m.statLastConsumption}
              value={lastLap ? `${lastLap.consumptionPerLapL.toFixed(2)} l` : '–'}
          />
          <FuelStat
              label={m.statLast5Consumption}
              value={avgLast5 ? `${avgLast5.consumptionPerLapL.toFixed(2)} l` : '–'}
          />
        </div>
      </div>

      <div className="fuel-stats-row" style={{ flexDirection: 'column', gap: '0' }}>
        <label style={{ fontSize: 'var(--font-md)' }}>
          {m.predictionsLabel}
        </label>
        <div className="fuel-stats-row" style={{ border: '0', paddingTop: '0' }}>
          <FuelStat label={m.statPitBy} value={lastLap ? `L${lastLap.pitByLap}` : '–'} />
          <FuelStat label={m.statRemaining} value={lastLap ? `${lastLap.marginLiters.toFixed(2)} l` : '–'} />
        </div>
        <div className="fuel-stats-row" style={{ border: '0', paddingTop: '4px' }}>
          <FuelStat label={m.statNextFill} value={nextPitFuelL !== null ? `${nextPitFuelL.toFixed(2)} l` : '–'} />
          <FuelStat label={m.statStopsLeft} value={stopsRemaining !== null ? `${stopsRemaining}` : '–'} />
        </div>
      </div>
    </div>
  )
}
