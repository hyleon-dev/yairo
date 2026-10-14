import type { TrackShape } from '../../../shared/types'
import type { SimSnapshot, SimSource } from '../snapshot'
import type { LmuFrame, LmuTelemetry, LmuVehicleScoring } from './lmuParse'
import { buildTrackShape } from './lmuRest'
import { buildSnapshot, GreenFlagTimer, type CarNumberLookup, type NationalityLookup } from './lmuSource'

// Simulated LMU race for local dev without LMU running ("npm run dev:mock").
// Builds an LmuFrame and runs it through the real buildSnapshot(), so only shared
// memory and REST are faked. Kept simple: always in your own car, no pit stops.

const FRAME_MS = 1000 / 30
const SESSION_DURATION_SEC = 60 * 60
const RACE_SESSION = 10
const TRACK_POINTS = 400
const PIT_OFFSET_M = 25
const PIT_SPAN = 0.08 // fraction of the lap around start/finish
const MAX_RPM = 9000
const FLAG_STEP_SEC = 6
const VE_PER_LAP = 0.07
const FUEL_PER_LAP_L = 3.2
const BRAKE_ZONES = [0.18, 0.42, 0.63, 0.88] // lap fractions
const BRAKE_ZONE_LENGTH = 0.03

interface FakeCar {
  id: number
  name: string
  nationality: string
  number: string
  vehicleName: string
  vehicleModel: string
  scoringClass: string
  classEnum: number
  baseSpeed: number // m/s
  hasVe: boolean
  fuelCapacity: number
  inGarage: boolean
  lapDist: number
  totalLaps: number
  lapStartET: number
  lastLapTime: number
  bestLapTime: number
  ve: number
  fuel: number
  wear: number
  speed: number
}

// [name, nationality, number, livery, model, scoring class, IP_VehicleClass, speed, VE, tank]
const ENTRIES: [string, string, string, string, string, string, number, number, boolean, number][] = [
  ['Alex Nguyen', 'VN', '7', 'Custom Team 2026 #397', 'Toyota TR010', 'Hyper', 0, 47, true, 110],
  ['Jonas Keller', 'DE', '20', 'BMW M Team WRT #20', 'BMW M Hybrid V8', 'Hyper', 0, 46.8, true, 110],
  ['Elena Rossi', 'IT', '51', 'Ferrari AF Corse #51', 'Ferrari 499P', 'Hyper', 0, 46.9, true, 110],
  ['Paul Dubois', 'FR', '93', 'Peugeot TotalEnergies #93', 'Peugeot 9x8', 'Hyper', 0, 46.6, true, 110],
  ['Ana Ferreira', 'PT', '36', 'Alpine Endurance Team #36', 'Alpine A424', 'Hyper', 0, 46.5, true, 115],
  ['Tom Bergström', 'SE', '22', 'United Autosports #22', 'Oreca 07', 'LMP2', 3, 44, false, 63],
  ['Sofia Novak', 'CZ', '28', 'IDEC Sport #28', 'Oreca 07', 'LMP2', 3, 43.8, false, 63],
  ["Liam O'Connor", 'IE', '83', 'Custom Team 2026 #397', 'Oreca 07', 'LMP2', 3, 43.6, false, 63],
  ['Nina Kowalski', 'PL', '92', 'Manthey Purerxcing #92', 'Porsche 911 GT3 R LMGT3', 'GT3', 6, 41, true, 120],
  ['Marco Bianchi', 'IT', '55', 'Vista AF Corse #55', 'Ferrari 296 LMGT3', 'GT3', 6, 40.8, true, 120],
  ['Sven Lindqvist', 'SE', '46', 'Team WRT #46', 'BMW M4 LMGT3', 'GT3', 6, 40.9, true, 120],
  ['Yuki Tanaka', 'JP', '81', 'TF Sport #81', 'Chevrolet Corvette Z06 LMGT3.', 'GT3', 6, 40.6, true, 120],
  ['Ben Harris', 'US', '59', 'United Autosports #59', 'McLaren 720S LMGT3 Evo', 'GT3', 6, 40.5, true, 120],
  ['Mia Schulz', 'DE', '777', 'D Station Racing #777', 'Aston Martin Vantage AMR LMGT', 'GT3', 6, 40.4, true, 120]
]
const PLAYER_ID = 0
const GARAGE_CAR_ID = ENTRIES.length - 1

interface FlagState {
  gamePhase: number
  yellowFlagState: number
  localYellow: boolean
  blue: boolean
  penalty: boolean
}

const FLAG_CYCLE: FlagState[] = [
  { gamePhase: 5, yellowFlagState: 0, localYellow: false, blue: false, penalty: false },
  { gamePhase: 5, yellowFlagState: 0, localYellow: true, blue: false, penalty: false },
  { gamePhase: 6, yellowFlagState: 1, localYellow: false, blue: false, penalty: false },
  { gamePhase: 6, yellowFlagState: 2, localYellow: false, blue: false, penalty: false },
  // Back to green after the FCY, so the green flag shows.
  { gamePhase: 5, yellowFlagState: 0, localYellow: false, blue: false, penalty: false },
  { gamePhase: 5, yellowFlagState: 0, localYellow: false, blue: true, penalty: false },
  { gamePhase: 5, yellowFlagState: 0, localYellow: false, blue: false, penalty: true },
  { gamePhase: 7, yellowFlagState: 0, localYellow: false, blue: false, penalty: false },
  { gamePhase: 8, yellowFlagState: 0, localYellow: false, blue: false, penalty: false }
]

interface TrackPoint {
  x: number
  z: number
  dist: number // m from the line start
}

function buildTrackLine(): { points: TrackPoint[]; length: number } {
  const points: TrackPoint[] = []
  let dist = 0
  for (let i = 0; i <= TRACK_POINTS; i++) {
    const t = (i / TRACK_POINTS) * 2 * Math.PI
    const x = 700 * Math.cos(t) + 150 * Math.cos(3 * t)
    const z = 400 * Math.sin(t) - 120 * Math.sin(2 * t)
    const prev = points[points.length - 1]
    if (prev) dist += Math.hypot(x - prev.x, z - prev.z)
    points.push({ x, z, dist })
  }
  return { points, length: dist }
}

function pointAt(line: TrackPoint[], dist: number, sideOffset = 0): { x: number; z: number } {
  const i = Math.max(1, line.findIndex((p) => p.dist >= dist))
  const a = line[i - 1]
  const b = line[i] ?? a
  const f = b.dist > a.dist ? (dist - a.dist) / (b.dist - a.dist) : 0
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  return { x: a.x + dx * f - (dz / len) * sideOffset, z: a.z + dz * f + (dx / len) * sideOffset }
}

function isBraking(lapFraction: number): boolean {
  return BRAKE_ZONES.some((start) => lapFraction >= start && lapFraction < start + BRAKE_ZONE_LENGTH)
}

// 0 = sector 3, 1 = sector 1, 2 = sector 2, like mSector.
function sectorOf(lapFraction: number): number {
  return [1, 2, 0][Math.min(2, Math.floor(lapFraction * 3))]
}

function createCars(): FakeCar[] {
  return ENTRIES.map(([name, nationality, number, vehicleName, vehicleModel, scoringClass, classEnum, baseSpeed, hasVe, tank], id) => ({
    id,
    name,
    nationality,
    number,
    vehicleName,
    vehicleModel,
    scoringClass,
    classEnum,
    baseSpeed,
    hasVe,
    fuelCapacity: tank,
    inGarage: id === GARAGE_CAR_ID,
    lapDist: 200 - id * 12, // grid order
    totalLaps: 0,
    lapStartET: 0,
    lastLapTime: -1,
    bestLapTime: -1,
    ve: hasVe ? 1 : 0,
    fuel: tank * 0.8,
    wear: 1,
    speed: 0
  }))
}

const fakeNationalities = (cars: FakeCar[]): NationalityLookup => ({
  lookup: (_vehFilename, driverName) => cars.find((c) => c.name === driverName)?.nationality.toLowerCase() ?? null
})

const fakeCarNumbers = (cars: FakeCar[]): CarNumberLookup => ({
  lookup: (slotId) => cars.find((c) => c.id === slotId)?.number
})

const sleepArray = new Int32Array(new SharedArrayBuffer(4))

export class FakeLmuSource implements SimSource {
  readonly name = 'lmu'
  private readonly line = buildTrackLine()
  private readonly cars = createCars()
  private readonly nationalities = fakeNationalities(this.cars)
  private readonly carNumbers = fakeCarNumbers(this.cars)
  private readonly greenFlag = new GreenFlagTimer()
  private readonly trackShape: TrackShape | null
  private currentET = 0
  private lastTickAt = Date.now()

  constructor() {
    console.log('[lmu-fake] fake LMU started, simulating a multiclass race')
    const raw = [
      ...this.line.points.map((p) => ({ type: 0, x: p.x, z: p.z })),
      ...this.pitLane().map((p) => ({ type: 1, x: p.x, z: p.z }))
    ]
    this.trackShape = buildTrackShape(`fake|${this.line.length.toFixed(0)}`, raw, this.line.length)
  }

  attach(): void {}

  waitForFrame(): boolean {
    const remaining = FRAME_MS - (Date.now() - this.lastTickAt)
    if (remaining > 0) Atomics.wait(sleepArray, 0, 0, remaining)
    const now = Date.now()
    this.advance((now - this.lastTickAt) / 1000)
    this.lastTickAt = now
    return true
  }

  read(): SimSnapshot {
    const frame = this.buildFrame()
    const showGreen = this.greenFlag.update(frame.scoring.gamePhase, frame.scoring.currentET)
    return {
      ...buildSnapshot(frame, -1, this.nationalities, this.carNumbers, { veTargetPct: 100, pitStopTimeSec: 42.5 }, showGreen),
      trackShape: this.trackShape
    }
  }

  close(): void {}

  private pitLane(): { x: number; z: number }[] {
    const { length } = this.line
    const span = PIT_SPAN * length
    return Array.from({ length: 40 }, (_, i) => {
      const dist = (length - span / 2 + (i / 39) * span) % length
      return pointAt(this.line.points, dist, PIT_OFFSET_M)
    })
  }

  private flagState(): FlagState {
    return FLAG_CYCLE[Math.floor(this.currentET / FLAG_STEP_SEC) % FLAG_CYCLE.length]
  }

  private advance(dtSec: number): void {
    this.currentET += dtSec
    const { length } = this.line
    for (const car of this.cars) {
      if (car.inGarage) {
        car.speed = 0
        continue
      }
      const braking = isBraking(car.lapDist / length)
      car.speed = car.baseSpeed * (braking ? 0.55 : 1.08)
      car.lapDist += car.speed * dtSec
      const lapShare = (car.speed * dtSec) / length
      if (car.hasVe) car.ve = Math.max(0, car.ve - VE_PER_LAP * lapShare)
      car.fuel = Math.max(0, car.fuel - FUEL_PER_LAP_L * lapShare)
      car.wear = Math.max(0, car.wear - 0.02 * lapShare)
      if (car.lapDist >= length) {
        car.lapDist -= length
        car.totalLaps++
        car.lastLapTime = this.currentET - car.lapStartET
        car.bestLapTime = car.bestLapTime > 0 ? Math.min(car.bestLapTime, car.lastLapTime) : car.lastLapTime
        car.lapStartET = this.currentET
      }
    }
  }

  private buildFrame(): LmuFrame {
    const { length } = this.line
    const flags = this.flagState()
    const progress = (car: FakeCar) => car.totalLaps * length + car.lapDist
    const order = [...this.cars].sort((a, b) => progress(b) - progress(a))
    const leader = order[0]
    const player = this.cars[PLAYER_ID]
    const sectorFlags: [number, number, number] = [11, 11, 11]
    // sectorFlags start at sector 1, mSector at sector 3.
    if (flags.localYellow) sectorFlags[(sectorOf(player.lapDist / length) + 2) % 3] = 1

    const vehicles: LmuVehicleScoring[] = this.cars.map((car) => ({
      id: car.id,
      driverName: car.name,
      vehicleName: car.vehicleName,
      vehFilename: `${car.number}_FAKE`,
      totalLaps: car.totalLaps,
      sector: sectorOf(car.lapDist / length),
      finishStatus: 0,
      lapDist: car.lapDist,
      bestLapTime: car.bestLapTime,
      lastLapTime: car.lastLapTime,
      numPenalties: car.id === PLAYER_ID && flags.penalty ? 1 : 0,
      numPitstops: car.inGarage ? 1 : 0,
      isPlayer: car.id === PLAYER_ID,
      control: car.id === PLAYER_ID ? 0 : 1,
      inPits: car.inGarage,
      place: order.indexOf(car) + 1,
      vehicleClass: car.scoringClass,
      timeBehindLeader: (progress(leader) - progress(car)) / car.baseSpeed,
      estimatedLapTime: length / car.baseSpeed,
      flag: car.id === PLAYER_ID && flags.blue ? 6 : 0,
      inGarageStall: car.inGarage
    }))

    const telemetry: LmuTelemetry[] = this.cars.map((car) => {
      const lapFraction = car.lapDist / length
      const braking = !car.inGarage && isBraking(lapFraction)
      const gear = car.inGarage ? 0 : Math.min(7, 1 + Math.floor(car.speed / 10))
      const pos = car.inGarage
        ? pointAt(this.line.points, 0, PIT_OFFSET_M + 12)
        : pointAt(this.line.points, car.lapDist % length)
      const tempK = 273.15 + 85 + (braking ? 6 : 0)
      return {
        id: car.id,
        elapsedTime: this.currentET,
        lapStartET: car.lapStartET,
        pos: { x: pos.x, y: 0, z: pos.z },
        localVel: { x: 0, y: 0, z: -car.speed },
        gear,
        engineRPM: car.inGarage ? 1200 : 4500 + ((car.speed % 10) / 10) * (MAX_RPM - 4500),
        engineMaxRPM: MAX_RPM,
        throttle: car.inGarage ? 0 : braking ? 0 : 1,
        brake: braking ? 0.85 : 0,
        clutch: 0,
        fuel: car.fuel,
        fuelCapacity: car.fuelCapacity,
        virtualEnergy: car.ve,
        speedLimiterActive: car.inGarage,
        trackLimitsSteps: car.id === PLAYER_ID ? 6 : 0,
        deltaBest: car.bestLapTime > 0 ? 0.4 * Math.sin(lapFraction * 2 * Math.PI) : 0,
        vehicleModel: car.vehicleModel,
        vehicleClass: car.classEnum,
        overheating: false,
        partsDetached: car.id === PLAYER_ID,
        // Some fixed damage on the player car, so the Damage overlay has something to show.
        dentSeverity: car.id === PLAYER_ID ? [0, 1, 0, 2, 0, 0, 1, 0] : [0, 0, 0, 0, 0, 0, 0, 0],
        wheels: Array.from({ length: 4 }, (_, i) => ({
          temperatureK: [tempK, tempK + 3, tempK + 1] as [number, number, number],
          wear: car.wear,
          flat: car.id === PLAYER_ID && i === 3,
          detached: false
        }))
      }
    })

    return {
      scoring: {
        trackName: 'Fake Circuit',
        session: RACE_SESSION,
        currentET: this.currentET,
        maxLaps: 2147483647,
        lapDist: length,
        numVehicles: this.cars.length,
        gamePhase: flags.gamePhase,
        yellowFlagState: flags.yellowFlagState,
        sectorFlags,
        inRealtime: true,
        ambientTemp: 18,
        trackTemp: 27,
        sessionTimeRemaining: Math.max(0, SESSION_DURATION_SEC - this.currentET),
        trackLimitsStepsPerPoint: 4,
        trackLimitsStepsPerPenalty: 20
      },
      vehicles,
      playerHasVehicle: true,
      telemetry
    }
  }
}
