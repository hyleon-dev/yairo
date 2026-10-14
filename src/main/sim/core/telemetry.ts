import type { TelemetryData, TireWheelData, TiresData } from '../../../shared/types'
import type { SimSnapshot } from '../snapshot'
import { buildFuelEstimate, trackFuelConsumption } from './fuel'

const ZERO_WHEEL: TireWheelData = { wearPct: 0, tempC: 0, tempUnit: 'C' }
const ZERO_TIRES: TiresData = { lf: ZERO_WHEEL, rf: ZERO_WHEEL, lr: ZERO_WHEEL, rr: ZERO_WHEEL }

const NO_TELEMETRY: Omit<TelemetryData, 'sim'> = {
  speedKph: 0,
  rpm: 0,
  rpmIdle: 0,
  rpmSLFirst: 0,
  rpmSLShift: 0,
  rpmSLLast: 0,
  rpmSLBlink: 0,
  gear: 0,
  throttlePct: 0,
  brakePct: 0,
  clutchPct: 0,
  fuelLevelL: 0,
  virtualEnergyPct: null,
  lap: 0,
  lapDistPct: 0,
  isOnTrack: false,
  lapCurrentTime: -1,
  lapLastTime: -1,
  lapBestTime: -1,
  lapDeltaToBest: 0,
  lapDeltaToBestValid: false,
  isOnPitRoad: false,
  pitLimiterActive: false,
  lowFuelWarning: false,
  incidentCount: 0,
  isSpectatingOther: false,
  fuelEstimate: null,
  currentDriverIncidentCount: -1,
  teamIncidentCount: -1,
  incidentLimit: '',
  tires: ZERO_TIRES,
  hasTireData: false,
  damage: null
}

let lastSpeedSample: { carIdx: number; lapDistPct: number; sessionTime: number } | null = null

// For sims without per-car speed.
// Speed is estimated from the change in track position (lapDistPct) between two ticks.
function estimateSpeedKph(carIdx: number, lapDistPct: number, sessionTime: number, trackMeters: number): number {
  const prev = lastSpeedSample
  lastSpeedSample = { carIdx, lapDistPct, sessionTime }

  if (!prev || prev.carIdx !== carIdx || lapDistPct < 0 || trackMeters <= 0) return 0

  let pctDelta = lapDistPct - prev.lapDistPct
  if (pctDelta < -0.5) pctDelta += 1 // crossed the start/finish line
  if (pctDelta <= 0) return 0

  const dt = sessionTime - prev.sessionTime
  if (dt <= 0) return 0

  return ((pctDelta * trackMeters) / dt) * 3.6
}

// Cars don't expose their own low-fuel dash warning threshold via
// telemetry. Approximated here with a fixed percentage instead.
const LOW_FUEL_PCT_THRESHOLD = 0.1

export function buildTelemetry(snap: SimSnapshot): TelemetryData {
  // Must run every tick to reset history.
  trackFuelConsumption(snap)

  const { session, player } = snap
  const { currentDriverIncidentCount, teamIncidentCount, incidentLimit } = session

  if (player) {
    return {
      sim: snap.sim,
      speedKph: player.speedKph,
      rpm: player.rpm,
      rpmIdle: player.rpmIdle,
      rpmSLFirst: player.rpmSLFirst,
      rpmSLShift: player.rpmSLShift,
      rpmSLLast: player.rpmSLLast,
      rpmSLBlink: player.rpmSLBlink,
      gear: player.gear,
      throttlePct: player.throttlePct,
      brakePct: player.brakePct,
      clutchPct: player.clutchPct,
      fuelLevelL: player.fuelLevelL,
      virtualEnergyPct: player.virtualEnergyPct,
      lap: player.lap,
      lapDistPct: player.lapDistPct,
      isOnTrack: true,
      lapCurrentTime: player.lapCurrentTime,
      lapLastTime: player.lapLastTime,
      lapBestTime: player.lapBestTime,
      lapDeltaToBest: player.lapDeltaToBest,
      lapDeltaToBestValid: player.lapDeltaToBestValid,
      isOnPitRoad: player.isOnPitRoad,
      pitLimiterActive: player.pitLimiterActive,
      lowFuelWarning: (player.virtualEnergyPct !== null ? player.virtualEnergyPct / 100 : player.fuelLevelPct) <= LOW_FUEL_PCT_THRESHOLD,
      incidentCount: player.incidentCount,
      isSpectatingOther: false,
      fuelEstimate: buildFuelEstimate(snap, player),
      currentDriverIncidentCount,
      teamIncidentCount,
      incidentLimit,
      tires: player.tires,
      hasTireData: true,
      damage: player.damage ?? null
    }
  }

  // When spectating / not in car.
  // Show speed/RPM/gear/lap times for the currently watched car,
  // where the sim provides per-vehicle data.
  // Pedal inputs and fuel level stay 0 if the sim has them only for the own car.
  const focusCarIdx = snap.focusCarIdx
  if (focusCarIdx < 0) return { ...NO_TELEMETRY, sim: snap.sim }

  const car = snap.cars.find((c) => c.carIdx === focusCarIdx)

  return {
    sim: snap.sim,
    speedKph:
      car?.speedKph ??
      estimateSpeedKph(focusCarIdx, car?.lapDistPct ?? -1, session.sessionTimeSec, session.trackLengthM),
    rpm: car?.rpm ?? 0,
    rpmIdle: -1,
    rpmSLFirst: car?.shiftLights?.rpmSLFirst ?? -1,
    rpmSLShift: car?.shiftLights?.rpmSLShift ?? -1,
    rpmSLLast: car?.shiftLights?.rpmSLLast ?? -1,
    rpmSLBlink: car?.shiftLights?.rpmSLBlink ?? -1,
    gear: car?.gear ?? 0,
    throttlePct: car?.inputs?.throttlePct ?? 0,
    brakePct: car?.inputs?.brakePct ?? 0,
    clutchPct: car?.inputs?.clutchPct ?? 0,
    fuelLevelL: car?.fuel?.fuelLevelL ?? 0,
    virtualEnergyPct: car?.fuel?.virtualEnergyPct ?? null,
    lap: car?.lap ?? 0,
    lapDistPct: car?.lapDistPct ?? 0,
    isOnTrack: true,
    lapCurrentTime: car?.currentLapTime ?? -1,
    lapLastTime: car?.lastLapTime ?? -1,
    lapBestTime: car?.bestLapTime ?? -1,
    // No precise delta-to-best-lap per track point is possible for other cars.
    lapDeltaToBest: 0,
    lapDeltaToBestValid: false,
    isOnPitRoad: false,
    pitLimiterActive: false,
    lowFuelWarning: false,
    incidentCount: car?.incidentCount ?? -1,
    isSpectatingOther: true,
    fuelEstimate: null,
    currentDriverIncidentCount,
    teamIncidentCount,
    incidentLimit,
    tires: car?.tires ?? ZERO_TIRES,
    hasTireData: car?.tires !== undefined,
    damage: null
  }
}
