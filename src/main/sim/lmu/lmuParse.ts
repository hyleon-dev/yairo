import { LMU_OFFSETS as O, LMU_SIZES } from './lmuOffsets'

const MAX_VEHICLES = 104

export interface LmuVec3 {
  x: number
  y: number
  z: number
}

export interface LmuScoringInfo {
  trackName: string
  session: number
  currentET: number
  sessionTimeRemaining: number
  maxLaps: number
  lapDist: number
  numVehicles: number
  gamePhase: number
  yellowFlagState: number
  sectorFlags: [number, number, number] // index 0 = sector 1, unlike LmuVehicleScoring.sector
  inRealtime: boolean
  ambientTemp: number
  trackTemp: number
}

export interface LmuVehicleScoring {
  id: number
  driverName: string
  vehicleName: string
  vehFilename: string
  totalLaps: number
  sector: number // 0 = sector 3, 1 = sector 1, 2 = sector 2
  finishStatus: number // 0 none, 1 finished, 2 dnf, 3 dq
  lapDist: number
  bestLapTime: number
  lastLapTime: number
  numPenalties: number
  numPitstops: number
  isPlayer: boolean
  control: number // -1 nobody, 0 local player, 1 local AI, 2 remote, 3 replay
  inPits: boolean
  place: number
  vehicleClass: string
  timeBehindLeader: number
  estimatedLapTime: number
  flag: number
  inGarageStall: boolean
}

export interface LmuWheel {
  temperatureK: [number, number, number]
  wear: number // 1 = new
  flat: boolean
  detached: boolean
}

export interface LmuTelemetry {
  id: number
  elapsedTime: number
  lapStartET: number
  pos: LmuVec3
  localVel: LmuVec3
  gear: number
  engineRPM: number
  engineMaxRPM: number
  throttle: number
  brake: number
  clutch: number
  fuel: number
  fuelCapacity: number
  virtualEnergy: number // 0..1, 0 for cars without virtual energy
  speedLimiterActive: boolean
  deltaBest: number
  vehicleModel: string
  vehicleClass: number // IP_VehicleClass
  overheating: boolean
  partsDetached: boolean // any part except wheels
  dentSeverity: number[] // 8 zones around the car, 0 none, 1 some, 2 more
  wheels: LmuWheel[] // FL, FR, RL, RR
}

export interface LmuFrame {
  scoring: LmuScoringInfo
  vehicles: LmuVehicleScoring[]
  playerHasVehicle: boolean
  telemetry: LmuTelemetry[]
}

const decoder = new TextDecoder('utf-8')

function str(buf: Buffer, off: number, len: number): string {
  const bytes = buf.subarray(off, off + len)
  const end = bytes.indexOf(0)
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end))
}

function vec3(buf: Buffer, off: number): LmuVec3 {
  return { x: buf.readDoubleLE(off), y: buf.readDoubleLE(off + 8), z: buf.readDoubleLE(off + 16) }
}

function parseScoringInfo(buf: Buffer): LmuScoringInfo {
  const b = O.root.scoring + O.scoring.scoringInfo
  const s = O.scoringInfo
  return {
    trackName: str(buf, b + s.mTrackName, 64),
    session: buf.readInt32LE(b + s.mSession),
    currentET: buf.readDoubleLE(b + s.mCurrentET),
    sessionTimeRemaining: buf.readFloatLE(b + s.mSessionTimeRemaining),
    maxLaps: buf.readInt32LE(b + s.mMaxLaps),
    lapDist: buf.readDoubleLE(b + s.mLapDist),
    numVehicles: buf.readInt32LE(b + s.mNumVehicles),
    gamePhase: buf.readUInt8(b + s.mGamePhase),
    yellowFlagState: buf.readInt8(b + s.mYellowFlagState),
    sectorFlags: [0, 1, 2].map((i) => buf.readInt8(b + s.mSectorFlag + i)) as [number, number, number],
    inRealtime: buf.readUInt8(b + s.mInRealtime) !== 0,
    ambientTemp: buf.readDoubleLE(b + s.mAmbientTemp),
    trackTemp: buf.readDoubleLE(b + s.mTrackTemp)
  }
}

function parseVehicle(buf: Buffer, idx: number): LmuVehicleScoring {
  const b = O.root.scoring + O.scoring.vehScoringInfo + idx * LMU_SIZES.vehScoring
  const v = O.vehScoring
  return {
    id: buf.readInt32LE(b + v.mID),
    driverName: str(buf, b + v.mDriverName, 32),
    vehicleName: str(buf, b + v.mVehicleName, 64),
    vehFilename: str(buf, b + v.mVehFilename, 32),
    totalLaps: buf.readInt16LE(b + v.mTotalLaps),
    sector: buf.readInt8(b + v.mSector),
    finishStatus: buf.readInt8(b + v.mFinishStatus),
    lapDist: buf.readDoubleLE(b + v.mLapDist),
    bestLapTime: buf.readDoubleLE(b + v.mBestLapTime),
    lastLapTime: buf.readDoubleLE(b + v.mLastLapTime),
    numPenalties: buf.readInt16LE(b + v.mNumPenalties),
    numPitstops: buf.readInt16LE(b + v.mNumPitstops),
    isPlayer: buf.readUInt8(b + v.mIsPlayer) !== 0,
    control: buf.readInt8(b + v.mControl),
    inPits: buf.readUInt8(b + v.mInPits) !== 0,
    place: buf.readUInt8(b + v.mPlace),
    vehicleClass: str(buf, b + v.mVehicleClass, 32),
    timeBehindLeader: buf.readDoubleLE(b + v.mTimeBehindLeader),
    estimatedLapTime: buf.readDoubleLE(b + v.mEstimatedLapTime),
    flag: buf.readUInt8(b + v.mFlag),
    inGarageStall: buf.readUInt8(b + v.mInGarageStall) !== 0
  }
}

function parseWheel(buf: Buffer, b: number): LmuWheel {
  const w = O.telemWheel
  return {
    temperatureK: [0, 1, 2].map((i) => buf.readDoubleLE(b + w.mTemperature + i * 8)) as [number, number, number],
    wear: buf.readDoubleLE(b + w.mWear),
    flat: buf.readUInt8(b + w.mFlat) !== 0,
    detached: buf.readUInt8(b + w.mDetached) !== 0
  }
}

function parseTelemetry(buf: Buffer, idx: number): LmuTelemetry {
  const b = O.root.telemetry + O.telemetry.telemInfo + idx * LMU_SIZES.telemInfo
  const t = O.telemInfo
  return {
    id: buf.readInt32LE(b + t.mID),
    elapsedTime: buf.readDoubleLE(b + t.mElapsedTime),
    lapStartET: buf.readDoubleLE(b + t.mLapStartET),
    pos: vec3(buf, b + t.mPos),
    localVel: vec3(buf, b + t.mLocalVel),
    gear: buf.readInt32LE(b + t.mGear),
    engineRPM: buf.readDoubleLE(b + t.mEngineRPM),
    engineMaxRPM: buf.readDoubleLE(b + t.mEngineMaxRPM),
    throttle: buf.readDoubleLE(b + t.mUnfilteredThrottle),
    brake: buf.readDoubleLE(b + t.mUnfilteredBrake),
    clutch: buf.readDoubleLE(b + t.mUnfilteredClutch),
    fuel: buf.readDoubleLE(b + t.mFuel),
    fuelCapacity: buf.readDoubleLE(b + t.mFuelCapacity),
    virtualEnergy: buf.readFloatLE(b + t.mVirtualEnergy),
    speedLimiterActive: buf.readUInt8(b + t.mSpeedLimiterActive) !== 0,
    deltaBest: buf.readDoubleLE(b + t.mDeltaBest),
    vehicleModel: str(buf, b + t.mVehicleModel, 30),
    vehicleClass: buf.readUInt8(b + t.mVehicleClass),
    overheating: buf.readUInt8(b + t.mOverheating) !== 0,
    partsDetached: buf.readUInt8(b + t.mDetached) !== 0,
    dentSeverity: Array.from({ length: 8 }, (_, i) => buf.readUInt8(b + t.mDentSeverity + i)),
    wheels: [0, 1, 2, 3].map((i) => parseWheel(buf, b + t.mWheel + i * LMU_SIZES.telemWheel))
  }
}

export function parseFrame(buf: Buffer): LmuFrame {
  const scoring = parseScoringInfo(buf)
  const tb = O.root.telemetry
  const vehicleCount = Math.max(0, Math.min(scoring.numVehicles, MAX_VEHICLES))
  const telemetryCount = Math.min(buf.readUInt8(tb + O.telemetry.activeVehicles), MAX_VEHICLES)

  return {
    scoring,
    vehicles: Array.from({ length: vehicleCount }, (_, i) => parseVehicle(buf, i)),
    playerHasVehicle: buf.readUInt8(tb + O.telemetry.playerHasVehicle) !== 0,
    telemetry: Array.from({ length: telemetryCount }, (_, i) => parseTelemetry(buf, i))
  }
}
