import { FLAG_BITS, type TireWheelData, type TiresData, type TrackSurfaceStatus } from '../../../shared/types'
import type { SimCar, SimPlayerCar, SimSession, SimSnapshot, SimSource } from '../snapshot'
import { LmuSharedMemory } from './lmuSharedMemory'
import { parseFrame, type LmuFrame, type LmuTelemetry, type LmuVec3, type LmuVehicleScoring, type LmuWheel } from './lmuParse'
import { isRestReachable, LmuFocusPoller, LmuNationalities } from './lmuRest'

// LMU sends telemetry at 100 Hz. Overlays don't need more than this.
const FRAME_INTERVAL_MS = 1000 / 30
// Waiting for the next 100 Hz frame adds up to one frame on top of the pause.
const LMU_FRAME_MS = 10

// IP_VehicleClass from the LMU header.
const VEHICLE_CLASS_PACE_CAR = 8
const VEHICLE_CLASS_UNKNOWN = 0xff

// Class colors close to the WEC/ELMS liveries. LMU itself provides none.
const CLASS_COLORS: Record<number, string> = {
  0: '#d7261e', // Hypercar
  2: '#1e6fd9', // LMP2 (ELMS)
  3: '#1e6fd9', // LMP2
  4: '#8a3ffc', // LMP3
  5: '#2e9e44', // GTE
  6: '#f08a00' // GT3
}
const DEFAULT_CLASS_COLOR = '#828287'

// Scoring class names that differ from the usual name.
const CLASS_DISPLAY_NAMES: Record<string, string> = {
  Hyper: 'Hypercar',
  LMP2_ELMS: 'LMP2'
}

// No shift points in LMU, only the rev limit. Approximated as fractions of it.
const SHIFT_LIGHT_FIRST = 0.8
const SHIFT_LIGHT_SHIFT = 0.96
const SHIFT_LIGHT_BLINK = 0.99

const KELVIN_OFFSET = 273.15
const UNLIMITED_LAPS_THRESHOLD = 100_000
const MAX_EXTRAPOLATION_SEC = 0.5
const FLAG_BLUE = 6

const sleepArray = new Int32Array(new SharedArrayBuffer(4))

export class LmuSource implements SimSource {
  readonly name = 'lmu'
  private readonly shm = new LmuSharedMemory()
  private readonly focus = new LmuFocusPoller()
  private readonly nationalities = new LmuNationalities()
  private lastFrameAt = 0
  private probingRest = false
  needsSetup = false

  constructor() {
    this.attach()
  }

  attach(): void {
    if (this.shm.isOpen && this.shm.isGameRunning()) return
    if (this.shm.open()) {
      this.needsSetup = false
      this.focus.start()
      this.nationalities.start()
    } else {
      this.focus.stop()
      this.nationalities.stop()
      void this.probeRest()
    }
  }

  // REST answers while LMU runs, LMU_Data only exists with "Enable Plugins" on.
  private async probeRest(): Promise<void> {
    if (this.probingRest) return
    this.probingRest = true
    try {
      const reachable = await isRestReachable()
      this.needsSetup = reachable && !this.shm.isOpen
    } finally {
      this.probingRest = false
    }
  }

  waitForFrame(timeoutMs: number): boolean {
    const pauseMs = FRAME_INTERVAL_MS - LMU_FRAME_MS - (Date.now() - this.lastFrameAt)
    if (pauseMs > 0) Atomics.wait(sleepArray, 0, 0, pauseMs)

    if (!this.shm.isOpen) return false
    // No new frame while paused or in menus. Keep publishing as long as the game runs.
    if (!this.shm.waitForFrame(timeoutMs) && !this.shm.isGameRunning()) return false

    this.lastFrameAt = Date.now()
    return true
  }

  close(): void {
    this.focus.stop()
    this.nationalities.stop()
    this.shm.close()
  }

  read(): SimSnapshot | null {
    const buf = this.shm.copy()
    if (!buf) return null
    return buildSnapshot(parseFrame(buf), this.focus.focusCarId, this.nationalities)
  }
}

function buildSnapshot(frame: LmuFrame, focusCarId: number, nationalities: LmuNationalities): SimSnapshot {
  const { scoring, vehicles } = frame
  const telemetryById = new Map(frame.telemetry.map((t) => [t.id, t]))
  const own = vehicles.find((v) => v.isPlayer)
  const ownCarIdx = own?.id ?? -1
  const ownTelemetry = telemetryById.get(ownCarIdx)
  // mControl switches to AI (1) when the player watches another car.
  const isDriving = !!own && !!ownTelemetry && frame.playerHasVehicle && scoring.inRealtime && own.control === 0
  const focusIsKnown = vehicles.some((v) => v.id === focusCarId)

  return {
    sim: 'lmu',
    session: buildSession(frame, own),
    ownCarIdx,
    focusCarIdx: isDriving || !focusIsKnown ? ownCarIdx : focusCarId,
    isDriving,
    player: isDriving && own && ownTelemetry ? buildPlayerCar(own, ownTelemetry, scoring.lapDist) : null,
    cars: buildCars(frame, telemetryById, nationalities)
  }
}

function sessionType(session: number): string {
  if (session === 0) return 'Test Day'
  if (session <= 4) return 'Practice'
  if (session <= 8) return 'Qualify'
  if (session === 9) return 'Warmup'
  return 'Race'
}

// gamePhase: 5 green, 6 full course yellow, 7 stopped, 8 session over.
function sessionFlags(frame: LmuFrame, own: LmuVehicleScoring | undefined): number {
  let flags = 0
  switch (frame.scoring.gamePhase) {
    case 6:
      flags |= FLAG_BITS.caution
      break
    case 7:
      flags |= FLAG_BITS.red
      break
    case 8:
      flags |= FLAG_BITS.checkered
      break
  }
  if (own?.flag === FLAG_BLUE) flags |= FLAG_BITS.blue
  return flags
}

function buildSession(frame: LmuFrame, own: LmuVehicleScoring | undefined): SimSession {
  const { scoring, vehicles } = frame
  const leader = vehicles.find((v) => v.place === 1)

  return {
    sessionNum: scoring.session,
    sessionType: sessionType(scoring.session),
    trackId: -1,
    trackName: scoring.trackName,
    trackLengthM: scoring.lapDist,
    sessionTimeSec: scoring.currentET,
    timeRemainSec: scoring.endET > 0 ? Math.max(0, scoring.endET - scoring.currentET) : null,
    lapsRemain:
      scoring.maxLaps > 0 && scoring.maxLaps < UNLIMITED_LAPS_THRESHOLD
        ? Math.max(0, scoring.maxLaps - (leader?.totalLaps ?? 0))
        : null,
    airTemp: scoring.ambientTemp,
    airTempUnit: 'C',
    trackTemp: scoring.trackTemp,
    trackTempUnit: 'C',
    grip: '',
    flags: sessionFlags(frame, own),
    currentDriverIncidentCount: -1,
    teamIncidentCount: -1,
    incidentLimit: '',
    leaderCarIdx: leader?.id ?? -1
  }
}

function speedMs(vel: LmuVec3): number {
  return Math.hypot(vel.x, vel.y, vel.z)
}

function wrapLapDistPct(lapDist: number, trackLength: number): number {
  if (trackLength <= 0) return 0
  return (((lapDist % trackLength) + trackLength) % trackLength) / trackLength
}

// Scoring (with lapDist) only comes at 5 Hz. Moves the car forward with its
// 100 Hz telemetry speed, so positions don't jump in steps.
function extrapolatedLapDist(vehicle: LmuVehicleScoring, telemetry: LmuTelemetry | undefined, scoringET: number): number {
  if (!telemetry) return vehicle.lapDist
  const age = Math.min(Math.max(0, telemetry.elapsedTime - scoringET), MAX_EXTRAPOLATION_SEC)
  return vehicle.lapDist + speedMs(telemetry.localVel) * age
}

function surfaceStatus(vehicle: LmuVehicleScoring): TrackSurfaceStatus {
  if (vehicle.inGarageStall) return 'in-pit-stall'
  if (vehicle.inPits) return 'approaching-pits'
  return 'on-track'
}

// e.g. "Heart of Racing Team 2026 #27:WEC"
function carNumber(vehicle: LmuVehicleScoring): string {
  return vehicle.vehicleName.match(/#(\d+)/)?.[1] ?? String(vehicle.id)
}

// LMU has no driver IDs (SteamID is 0 offline). Hash of the name, negative so it never
// collides with iRacing customer IDs in the shared driver stats.
function driverIdFromName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (Math.imul(hash, 31) + name.charCodeAt(i)) | 0
  return -(Math.abs(hash) + 1)
}

function buildCars(frame: LmuFrame, telemetryById: Map<number, LmuTelemetry>, nationalities: LmuNationalities): SimCar[] {
  const { scoring } = frame

  return frame.vehicles
    .map((vehicle) => ({ vehicle, telemetry: telemetryById.get(vehicle.id) }))
    .filter(({ telemetry }) => telemetry?.vehicleClass !== VEHICLE_CLASS_PACE_CAR)
    // Class order of the standings follows the order of first appearance. Hypercar comes first.
    .sort((a, b) => (a.telemetry?.vehicleClass ?? VEHICLE_CLASS_UNKNOWN) - (b.telemetry?.vehicleClass ?? VEHICLE_CLASS_UNKNOWN))
    .map(({ vehicle, telemetry }) => {
      const classId = telemetry?.vehicleClass ?? VEHICLE_CLASS_UNKNOWN
      return {
        carIdx: vehicle.id,
        isLive: true,
        surface: surfaceStatus(vehicle),
        driverId: driverIdFromName(vehicle.driverName),
        driverName: vehicle.driverName,
        teamName: '',
        carNumber: carNumber(vehicle),
        carId: -1,
        carName: telemetry?.vehicleModel ?? '',
        classId,
        className: CLASS_DISPLAY_NAMES[vehicle.vehicleClass] ?? vehicle.vehicleClass,
        classColorHex: CLASS_COLORS[classId] ?? DEFAULT_CLASS_COLOR,
        classEstLapTime: vehicle.estimatedLapTime > 0 ? vehicle.estimatedLapTime : -1,
        iRating: null,
        licString: null,
        licColorHex: null,
        flagIsoCode: nationalities.lookup(vehicle.vehFilename, vehicle.driverName, vehicle.isPlayer),
        incidentCount: -1,
        position: vehicle.place,
        lap: vehicle.totalLaps + 1,
        lapsCompleted: vehicle.totalLaps,
        lapDistPct: wrapLapDistPct(extrapolatedLapDist(vehicle, telemetry, scoring.currentET), scoring.lapDist),
        gapToLeaderSec: vehicle.timeBehindLeader,
        bestLapTime: vehicle.bestLapTime,
        lastLapTime: vehicle.lastLapTime,
        currentLapTime: telemetry ? telemetry.elapsedTime - telemetry.lapStartET : -1,
        rpm: telemetry?.engineRPM ?? 0,
        gear: telemetry?.gear ?? 0,
        speedKph: telemetry ? speedMs(telemetry.localVel) * 3.6 : undefined
      }
    })
}

function buildWheel(wheel: LmuWheel | undefined): TireWheelData {
  if (!wheel) return { wearPct: 0, tempC: 0, tempUnit: 'C' }
  const [l, m, r] = wheel.temperatureK
  return {
    wearPct: wheel.wear * 100,
    tempC: (l + m + r) / 3 - KELVIN_OFFSET,
    tempUnit: 'C'
  }
}

function buildTires(telemetry: LmuTelemetry): TiresData {
  const [fl, fr, rl, rr] = telemetry.wheels
  return { lf: buildWheel(fl), rf: buildWheel(fr), lr: buildWheel(rl), rr: buildWheel(rr) }
}

function buildPlayerCar(vehicle: LmuVehicleScoring, telemetry: LmuTelemetry, trackLength: number): SimPlayerCar {
  const maxRpm = telemetry.engineMaxRPM
  const hasShiftLights = maxRpm > 0

  return {
    speedKph: speedMs(telemetry.localVel) * 3.6,
    rpm: telemetry.engineRPM,
    rpmIdle: -1,
    rpmSLFirst: hasShiftLights ? maxRpm * SHIFT_LIGHT_FIRST : -1,
    rpmSLShift: hasShiftLights ? maxRpm * SHIFT_LIGHT_SHIFT : -1,
    rpmSLLast: hasShiftLights ? maxRpm * SHIFT_LIGHT_SHIFT : -1,
    rpmSLBlink: hasShiftLights ? maxRpm * SHIFT_LIGHT_BLINK : -1,
    gear: telemetry.gear,
    throttlePct: telemetry.throttle,
    brakePct: telemetry.brake,
    clutchPct: telemetry.clutch,
    fuelLevelL: telemetry.fuel,
    fuelLevelPct: telemetry.fuelCapacity > 0 ? telemetry.fuel / telemetry.fuelCapacity : 1,
    fuelCapacityL: telemetry.fuelCapacity,
    nextPitFuelL: null,
    lap: vehicle.totalLaps + 1,
    lapDistPct: wrapLapDistPct(vehicle.lapDist, trackLength),
    lapCurrentTime: telemetry.elapsedTime - telemetry.lapStartET,
    lapLastTime: vehicle.lastLapTime,
    lapBestTime: vehicle.bestLapTime,
    lapDeltaToBest: telemetry.deltaBest,
    lapDeltaToBestValid: vehicle.bestLapTime > 0,
    isOnPitRoad: vehicle.inPits,
    pitLimiterActive: telemetry.speedLimiterActive,
    incidentCount: -1,
    tires: buildTires(telemetry)
  }
}
