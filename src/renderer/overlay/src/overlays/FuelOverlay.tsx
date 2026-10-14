import type { FuelOverlaySettings, TelemetryData } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
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

export function FuelOverlay({ data, settings }: { data: TelemetryData; settings: FuelOverlaySettings }) {
  const lastLap = data.fuelEstimate?.lastLap ?? null
  const avgLast5 = data.fuelEstimate?.avgLast5 ?? null
  const nextPitFill = data.fuelEstimate?.nextPitFill ?? null
  const stopsRemaining = data.fuelEstimate?.stopsRemaining ?? null
  const lapHistory = data.fuelEstimate?.lapHistory ?? []
  const isVirtualEnergy = data.virtualEnergyPct !== null
  const level = data.virtualEnergyPct ?? data.fuelLevelL
  const amount = (value: number) => (isVirtualEnergy ? `${value.toFixed(2)} %` : `${value.toFixed(2)} l`)

  return (
    <div className="card fuel">
      <div className="fuel-stats-row">
        <div>
          <div className="fuel-large-value">
            <div className="big-number small">{level.toFixed(isVirtualEnergy ? 1 : 2)}</div>
            <div className="unit">{isVirtualEnergy ? m.unitVirtualEnergy : m.unit}</div>
          </div>

          <div className="fuel-large-value-sub">
            {lastLap ? m.lapsRemaining(lastLap.lapsRemaining) : m.rangeUnknown}
          </div>
        </div>

        <div>
          <div  className="fuel-large-value">
            <div className="big-number small">{stopsRemaining !== null ? `${stopsRemaining}` : '0'}</div>
          </div>
          <div className="fuel-large-value-sub">{m.statStopsLeft}</div>
        </div>
      </div>

      <div className="fuel-stats-row" style={{ flexDirection: 'column', gap: '0' }}>
        <label style={{ fontSize: 'var(--font-md)' }}>
          {m.consumptionLabel}
        </label>
        <div className="fuel-stats-row" style={{ border: '0', paddingTop: '0' }}>
          <FuelStat
              label={m.statLastConsumption}
              value={lastLap ? amount(lastLap.consumptionPerLap) : '–'}
          />
          <FuelStat
              label={m.statLast5Consumption}
              value={avgLast5 ? amount(avgLast5.consumptionPerLap) : '–'}
          />
        </div>
      </div>

      <div className="fuel-stats-row" style={{ flexDirection: 'column', gap: '0' }}>
        <label style={{ fontSize: 'var(--font-md)' }}>
          {m.predictionsLabel}
        </label>
        <div className="fuel-stats-row" style={{ border: '0', paddingTop: '0' }}>
          <FuelStat label={m.statPitBy} value={lastLap ? `L${lastLap.pitByLap}` : '–'} />
          <FuelStat label={m.statRemaining} value={lastLap ? amount(lastLap.margin) : '–'} />
        </div>
        <div className="fuel-stats-row" style={{ border: '0', paddingTop: '4px' }}>
          <FuelStat label={m.statNextFill} value={nextPitFill !== null ? amount(nextPitFill) : '–'} />
        </div>
      </div>

      {settings.showLapHistory && (
        <div className="fuel-stats-row" style={{ flexDirection: 'column', gap: '0' }}>
          <label style={{ fontSize: 'var(--font-md)' }}>{m.historyLabel}</label>
          <div className="fuel-stats-row fuel-history-row" style={{ border: '0', paddingTop: '0' }}>
            {lapHistory.length === 0 && <FuelStat label="–" value="–" />}
            {lapHistory.map((entry) => (
              <FuelStat key={entry.lap} label={m.historyLap(entry.lap)} value={amount(entry.consumption)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
