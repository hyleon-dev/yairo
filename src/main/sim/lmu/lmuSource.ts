import {
  FLAG_BITS,
  type DamageData,
  type DamageLevel,
  type TireWheelData,
  type TiresData,
  type TrackSurfaceStatus,
  type WheelDamage
} from '../../../shared/types'
import type { SimCar, SimPlayerCar, SimSession, SimShiftLights, SimSnapshot, SimSource } from '../snapshot'
import { LmuSharedMemory } from './lmuSharedMemory'
import { parseFrame, type LmuFrame, type LmuTelemetry, type LmuVec3, type LmuVehicleScoring, type LmuWheel } from './lmuParse'
import { isRestReachable, LmuCarNumbers, LmuFocusPoller, LmuPitMenu, LmuNationalities, LmuSessionWatcher, LmuTrackShapeLoader, toMapPoint } from './lmuRest'

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
// Live: 11 without yellow, 1 with yellow.
const SECTOR_FLAG_YELLOW = 1
const YELLOW_STATE_PENDING = 1
const FINISH_STATUS_FINISHED = 1
const FINISH_STATUS_DQ = 3
const FIRST_RACE_SESSION = 10
const GREEN_FLAG_SEC = 5

const GAME_PHASE = { green: 5, fullCourseYellow: 6, stopped: 7, over: 8, paused: 9 } as const

export type NationalityLookup = Pick<LmuNationalities, 'lookup'>
export type CarNumberLookup = Pick<LmuCarNumbers, 'lookup'>
export type PitMenuState = Pick<LmuPitMenu, 'veTargetPct'>

const sleepArray = new Int32Array(new SharedArrayBuffer(4))

export class LmuSource implements SimSource {
  readonly name = 'lmu'
  private readonly shm = new LmuSharedMemory()
  private readonly focus = new LmuFocusPoller()
  private readonly carNumbers = new LmuCarNumbers()
  private readonly pitMenu = new LmuPitMenu()
  private readonly nationalities = new LmuNationalities()
  private readonly trackShape = new LmuTrackShapeLoader()
  private readonly session = new LmuSessionWatcher()
  private readonly greenFlag = new GreenFlagTimer()
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
      this.carNumbers.start()
      this.pitMenu.start()
      this.nationalities.start()
      this.session.start()
    } else {
      this.focus.stop()
      this.carNumbers.stop()
      this.pitMenu.stop()
      this.nationalities.stop()
      this.session.stop()
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
    // Like a lost connection, so all overlays clear. The wait keeps the worker loop from spinning.
    if (!this.session.inSession) {
      Atomics.wait(sleepArray, 0, 0, timeoutMs)
      return false
    }
    // No new frame while paused. Keep publishing as long as the game runs.
    if (!this.shm.waitForFrame(timeoutMs) && !this.shm.isGameRunning()) return false

    this.lastFrameAt = Date.now()
    return true
  }

  close(): void {
    this.focus.stop()
    this.carNumbers.stop()
    this.pitMenu.stop()
    this.nationalities.stop()
    this.session.stop()
    this.trackShape.reset()
    this.shm.close()
  }

  read(): SimSnapshot | null {
    const buf = this.shm.copy()
    if (!buf) return null
    const frame = parseFrame(buf)
    const { trackName, lapDist } = frame.scoring
    this.trackShape.update(trackName ? `${trackName}|${lapDist.toFixed(0)}` : '', lapDist)
    const showGreen = this.greenFlag.update(frame.scoring.gamePhase, frame.scoring.currentET)
    return { ...buildSnapshot(frame, this.focus.focusCarId, this.nationalities, this.carNumbers, this.pitMenu, showGreen), trackShape: this.trackShape.shape }
  }
}

// LMU has no green flag of its own. Green shows for a moment when the session goes green, like in iRacing.
export class GreenFlagTimer {
  private lastPhase = -1
  private lastET = 0
  private greenUntilET = -Infinity

  update(phase: number, currentET: number): boolean {
    if (currentET < this.lastET) this.greenUntilET = -Infinity
    this.lastET = currentET
    if (phase === GAME_PHASE.paused) return false
    if (phase === GAME_PHASE.green && this.lastPhase !== -1 && this.lastPhase !== GAME_PHASE.green) {
      this.greenUntilET = currentET + GREEN_FLAG_SEC
    }
    this.lastPhase = phase
    return phase === GAME_PHASE.green && currentET < this.greenUntilET
  }
}

export function buildSnapshot(
  frame: LmuFrame,
  focusCarId: number,
  nationalities: NationalityLookup,
  carNumbers: CarNumberLookup,
  pitMenu: PitMenuState,
  showGreen: boolean
): SimSnapshot {
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
    session: buildSession(frame, own, showGreen),
    ownCarIdx,
    focusCarIdx: isDriving || !focusIsKnown ? ownCarIdx : focusCarId,
    isDriving,
    player: isDriving && own && ownTelemetry ? buildPlayerCar(own, ownTelemetry, scoring.lapDist, pitMenu) : null,
    cars: buildCars(frame, telemetryById, nationalities, carNumbers)
  }
}

function sessionType(session: number): string {
  if (session === 0) return 'Test Day'
  if (session <= 4) return 'Practice'
  if (session <= 8) return 'Qualify'
  if (session === 9) return 'Warmup'
  return 'Race'
}

function isLastLap(frame: LmuFrame, leader: LmuVehicleScoring | undefined): boolean {
  const { scoring } = frame
  if (scoring.session < FIRST_RACE_SESSION || scoring.gamePhase !== GAME_PHASE.green) return false
  if (!leader || leader.finishStatus !== 0) return false
  if (scoring.maxLaps > 0 && scoring.maxLaps < UNLIMITED_LAPS_THRESHOLD) return leader.totalLaps === scoring.maxLaps - 1
  // Timed race: the leader's next crossing after the time runs out ends it.
  return scoring.sessionTimeRemaining <= 0
}

// Yellow in the current or the next sector counts.
function hasLocalYellow(frame: LmuFrame, own: LmuVehicleScoring): boolean {
  const { sectorFlags } = frame.scoring
  // own.sector is 0 = sector 3, 1 = sector 1, 2 = sector 2. sectorFlags start at sector 1.
  const current = (own.sector + 2) % 3
  const next = (current + 1) % 3
  return sectorFlags[current] === SECTOR_FLAG_YELLOW || sectorFlags[next] === SECTOR_FLAG_YELLOW
}

function sessionFlags(
  frame: LmuFrame,
  own: LmuVehicleScoring | undefined,
  leader: LmuVehicleScoring | undefined,
  showGreen: boolean
): number {
  const { gamePhase, yellowFlagState } = frame.scoring
  let flags = 0
  if (gamePhase === GAME_PHASE.fullCourseYellow) {
    flags |= yellowFlagState === YELLOW_STATE_PENDING ? FLAG_BITS.cautionWaving : FLAG_BITS.caution
  }
  if (gamePhase === GAME_PHASE.stopped) flags |= FLAG_BITS.red
  if (gamePhase === GAME_PHASE.over || frame.vehicles.some((v) => v.finishStatus === FINISH_STATUS_FINISHED)) {
    flags |= FLAG_BITS.checkered
  }
  if (isLastLap(frame, leader)) flags |= FLAG_BITS.white
  if (showGreen) flags |= FLAG_BITS.green
  if (own) {
    if (own.flag === FLAG_BLUE) flags |= FLAG_BITS.blue
    if (own.numPenalties > 0) flags |= FLAG_BITS.black
    if (own.finishStatus === FINISH_STATUS_DQ) flags |= FLAG_BITS.disqualify
    if (hasLocalYellow(frame, own)) flags |= FLAG_BITS.yellow
  }
  return flags
}

function buildSession(frame: LmuFrame, own: LmuVehicleScoring | undefined, showGreen: boolean): SimSession {
  const { scoring, vehicles } = frame
  const leader = vehicles.find((v) => v.place === 1)

  return {
    sessionNum: scoring.session,
    sessionType: sessionType(scoring.session),
    trackId: -1,
    trackName: scoring.trackName,
    trackLengthM: scoring.lapDist,
    sessionTimeSec: scoring.currentET,
    timeRemainSec: scoring.sessionTimeRemaining >= 0 ? scoring.sessionTimeRemaining : null,
    lapsRemain:
      scoring.maxLaps > 0 && scoring.maxLaps < UNLIMITED_LAPS_THRESHOLD
        ? Math.max(0, scoring.maxLaps - (leader?.totalLaps ?? 0))
        : null,
    airTemp: scoring.ambientTemp,
    airTempUnit: 'C',
    trackTemp: scoring.trackTemp,
    trackTempUnit: 'C',
    // mTrackGripLevel exists but its scale is undocumented, hidden via SIM_FEATURES.trackGrip.
    grip: '',
    flags: sessionFlags(frame, own, leader, showGreen),
    currentDriverIncidentCount: -1,
    teamIncidentCount: -1,
    incidentLimit: '',
    leaderCarIdx: leader?.id ?? -1
  }
}

// Cars not yet placed in the world report (0, 0, 0).
function worldPos(telemetry: LmuTelemetry | undefined): { x: number; y: number } | undefined {
  if (!telemetry) return undefined
  const { x, y, z } = telemetry.pos
  if (x === 0 && y === 0 && z === 0) return undefined
  return toMapPoint(x, z)
}

function virtualEnergyPct(telemetry: LmuTelemetry): number | null {
  return telemetry.virtualEnergy > 0 ? telemetry.virtualEnergy * 100 : null
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

// Fallback until REST answers, e.g. "Heart of Racing Team 2026 #27:WEC".
function carNumber(vehicle: LmuVehicleScoring, carNumbers: CarNumberLookup): string {
  return carNumbers.lookup(vehicle.id) ?? vehicle.vehicleName.match(/#(\d+)/)?.[1] ?? String(vehicle.id)
}

// LMU has no driver IDs (SteamID is 0 offline). Hash of the name, negative so it never
// collides with iRacing customer IDs in the shared driver stats.
function driverIdFromName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (Math.imul(hash, 31) + name.charCodeAt(i)) | 0
  return -(Math.abs(hash) + 1)
}

function buildCars(
  frame: LmuFrame,
  telemetryById: Map<number, LmuTelemetry>,
  nationalities: NationalityLookup,
  carNumbers: CarNumberLookup
): SimCar[] {
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
        carNumber: carNumber(vehicle, carNumbers),
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
        speedKph: telemetry ? speedMs(telemetry.localVel) * 3.6 : undefined,
        worldPos: worldPos(telemetry),
        shiftLights: telemetry && shiftLights(telemetry),
        inputs: telemetry && { throttlePct: telemetry.throttle, brakePct: telemetry.brake, clutchPct: telemetry.clutch },
        fuel: telemetry && { fuelLevelL: telemetry.fuel, virtualEnergyPct: virtualEnergyPct(telemetry) },
        tires: telemetry && hasTireData(telemetry) ? buildTires(telemetry) : undefined,
        pitStops: vehicle.numPitstops,
        penalties: vehicle.numPenalties
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

// Online LMU sends 0 K for other drivers' tires.
function hasTireData(telemetry: LmuTelemetry): boolean {
  return telemetry.wheels.some((wheel) => wheel.temperatureK.some((k) => k > 0))
}

function buildTires(telemetry: LmuTelemetry): TiresData {
  const [fl, fr, rl, rr] = telemetry.wheels
  return { lf: buildWheel(fl), rf: buildWheel(fr), lr: buildWheel(rl), rr: buildWheel(rr) }
}

function shiftLights(telemetry: LmuTelemetry): SimShiftLights {
  const maxRpm = telemetry.engineMaxRPM
  const hasShiftLights = maxRpm > 0
  return {
    rpmSLFirst: hasShiftLights ? maxRpm * SHIFT_LIGHT_FIRST : -1,
    rpmSLShift: hasShiftLights ? maxRpm * SHIFT_LIGHT_SHIFT : -1,
    rpmSLLast: hasShiftLights ? maxRpm * SHIFT_LIGHT_SHIFT : -1,
    rpmSLBlink: hasShiftLights ? maxRpm * SHIFT_LIGHT_BLINK : -1
  }
}

// mDentSeverity index to zone, undocumented in the header. Verified live by hitting front, rear left, front right.
const DENT_ZONES: (keyof DamageData['body'])[] = [
  'frontRight',
  'front',
  'frontLeft',
  'left',
  'rearLeft',
  'rear',
  'rearRight',
  'right'
]

function wheelDamage(wheel: LmuWheel | undefined): WheelDamage {
  if (wheel?.detached) return 'detached'
  if (wheel?.flat) return 'flat'
  return 'ok'
}

function buildDamage(telemetry: LmuTelemetry): DamageData {
  const body = {} as DamageData['body']
  DENT_ZONES.forEach((zone, i) => {
    body[zone] = Math.min(2, telemetry.dentSeverity[i] ?? 0) as DamageLevel
  })
  const [fl, fr, rl, rr] = telemetry.wheels
  return {
    body,
    wheels: { lf: wheelDamage(fl), rf: wheelDamage(fr), lr: wheelDamage(rl), rr: wheelDamage(rr) },
    overheating: telemetry.overheating,
    partsDetached: telemetry.partsDetached
  }
}

function nextPitFill(telemetry: LmuTelemetry, pitMenu: PitMenuState): number | null {
  const ve = virtualEnergyPct(telemetry)
  if (ve === null || pitMenu.veTargetPct === null) return null
  return Math.max(0, pitMenu.veTargetPct - ve)
}

function buildPlayerCar(
  vehicle: LmuVehicleScoring,
  telemetry: LmuTelemetry,
  trackLength: number,
  pitMenu: PitMenuState
): SimPlayerCar {
  return {
    speedKph: speedMs(telemetry.localVel) * 3.6,
    rpm: telemetry.engineRPM,
    rpmIdle: -1,
    ...shiftLights(telemetry),
    gear: telemetry.gear,
    throttlePct: telemetry.throttle,
    brakePct: telemetry.brake,
    clutchPct: telemetry.clutch,
    fuelLevelL: telemetry.fuel,
    fuelLevelPct: telemetry.fuelCapacity > 0 ? telemetry.fuel / telemetry.fuelCapacity : 1,
    fuelCapacityL: telemetry.fuelCapacity,
    nextPitFill: nextPitFill(telemetry, pitMenu),
    virtualEnergyPct: virtualEnergyPct(telemetry),
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
    tires: buildTires(telemetry),
    damage: buildDamage(telemetry)
  }
}
