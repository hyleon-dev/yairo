import type { DamageData, SimulatorId, TiresData, TrackLimits, TrackShape, TrackSurfaceStatus } from '../../shared/types'

// Simulator-independent view of one tick. Each SimSource maps its own SDK onto this,
// and all overlay payloads are built from it (see sim/core).

export interface SimSession {
  // Changes when a new session starts. Used to reset per-session tracking.
  sessionNum: number
  sessionType: string // e.g. "Race", "Practice", "Qualify"
  trackId: number // -1 if unknown
  trackName: string
  trackLengthM: number // 0 if unknown
  sessionTimeSec: number
  timeRemainSec: number | null
  lapsRemain: number | null
  airTemp: number
  airTempUnit: string
  trackTemp: number
  trackTempUnit: string
  grip: string
  flags: number // FLAG_BITS bitmask
  // Own car/team, regardless of camera focus. -1 = not available.
  currentDriverIncidentCount: number
  teamIncidentCount: number
  incidentLimit: string
  // Overall P1, -1 if unknown.
  leaderCarIdx: number
}

// Official session classification. Stays for a driver even after they left the server.
export interface SimOfficialResult {
  position: number
  lapsCompleted: number
  bestLapTime: number
  lastLapTime: number
}

export interface SimCar {
  carIdx: number
  // In the live roster (connected, not a spectator or pace car). False for cars only
  // known from `official`.
  isLive: boolean
  surface: TrackSurfaceStatus | null // null = not in world
  driverId: number | undefined
  driverName: string
  teamName: string
  carNumber: string
  carId: number
  carName: string
  classId: number
  className: string
  classColorHex: string
  classEstLapTime: number // s, -1 if unknown
  // null if the sim has no driver ratings.
  iRating: number | null
  licString: string | null
  licColorHex: string | null
  flagIsoCode: string | null
  incidentCount: number // -1 = not available
  position: number // live overall position, 0 = not classified
  lap: number
  lapsCompleted: number
  lapDistPct: number
  gapToLeaderSec: number
  bestLapTime: number // s, <= 0 if none
  lastLapTime: number // s, <= 0 if none
  currentLapTime: number // s, -1 if unknown
  rpm: number
  gear: number
  // Undefined if the sim has no per-car speed. Then it is estimated from lapDistPct.
  speedKph?: number
  // TrackShape coordinates. Undefined if the sim has no world positions.
  worldPos?: { x: number; y: number }
  // Undefined if the sim has inputs and fuel only for the own car (iRacing).
  inputs?: { throttlePct: number; brakePct: number; clutchPct: number }
  shiftLights?: SimShiftLights
  fuel?: { fuelLevelL: number; virtualEnergyPct: number | null }
  tires?: TiresData
  // Undefined if the sim doesn't provide them.
  pitStops?: number
  penalties?: number
  official?: SimOfficialResult
}

export interface SimShiftLights {
  rpmSLFirst: number
  rpmSLShift: number
  rpmSLLast: number
  rpmSLBlink: number
}

// Own car while actively driving it.
export interface SimPlayerCar {
  speedKph: number
  rpm: number
  rpmIdle: number
  rpmSLFirst: number
  rpmSLShift: number
  rpmSLLast: number
  rpmSLBlink: number
  gear: number
  throttlePct: number
  brakePct: number
  clutchPct: number // 1 = fully pressed
  fuelLevelL: number
  fuelLevelPct: number // 0..1
  fuelCapacityL: number // 0 if unknown
  nextPitFill: number | null // liters, or % VE if virtualEnergyPct is set
  pitStopTimeSec?: number | null
  virtualEnergyPct: number | null // 0..100, null if the car has no virtual energy
  lap: number
  lapDistPct: number
  lapCurrentTime: number
  lapLastTime: number
  lapBestTime: number
  lapDeltaToBest: number
  lapDeltaToBestValid: boolean
  isOnPitRoad: boolean
  pitLimiterActive: boolean
  incidentCount: number
  tires: TiresData
  damage?: DamageData
  trackLimits?: TrackLimits
}

export interface SimSnapshot {
  sim: SimulatorId
  session: SimSession
  ownCarIdx: number // -1 if none
  // Own car while driving, else the car the camera follows.
  focusCarIdx: number
  isDriving: boolean
  player: SimPlayerCar | null // null while not driving
  cars: SimCar[]
  // Same object until the layout changes. Undefined if the sim has no track outline.
  trackShape?: TrackShape | null
}

export interface SimSource {
  readonly name: SimulatorId
  // Sim runs but provides no data (e.g. LMU without "Enable Plugins").
  readonly needsSetup?: boolean
  // (Re)tries to attach to the sim. Called periodically while disconnected.
  attach(): void
  // Blocks until a new frame is available. False on timeout or when not connected.
  waitForFrame(timeoutMs: number): boolean
  read(): SimSnapshot | null
  // Releases native handles. Called between frames, never during a blocking wait.
  close(): void
}
