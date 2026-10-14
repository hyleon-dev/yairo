// One-off local tool. Not part of the running app.
// Reads the LMU shared memory (LMU_Data) and writes dump_lmu.json to the project root.
// Also samples a few seconds to measure update rates of scoring and telemetry.
// Track maps from the REST API go to resources/lmu-trackmap-assets/ (not committed).
// LMU must run with "Settings > Gameplay > Enable Plugins" on.
// Usage: npm run dump-lmu
const fs = require('node:fs')
const path = require('node:path')
const koffi = require('koffi')
const { LMU_SIZES, LMU_OFFSETS: O, LMU_EVENT } = require('../src/main/sim/lmu/lmuOffsets.ts')

const SAMPLE_MS = 5000
const outPath = path.join(__dirname, '..', 'dump_lmu.json')
const restOutDir = path.join(__dirname, '..', 'resources', 'lmu-trackmap-assets')
const REST_BASE = 'http://127.0.0.1:6397'

const FILE_MAP_READ = 0x0004
const FILE_MAP_WRITE = 0x0002
const SYNCHRONIZE = 0x00100000
const EVENT_MODIFY_STATE = 0x0002
const WAIT_OBJECT_0 = 0

const k32 = koffi.load('kernel32.dll')
const OpenFileMappingA = k32.func('void* __stdcall OpenFileMappingA(uint32 access, bool inherit, str name)')
const MapViewOfFile = k32.func('void* __stdcall MapViewOfFile(void* h, uint32 access, uint32 hi, uint32 lo, size_t n)')
const OpenEventA = k32.func('void* __stdcall OpenEventA(uint32 access, bool inherit, str name)')
const WaitForSingleObject = k32.func('uint32 __stdcall WaitForSingleObject(void* h, uint32 ms)')
const SetEvent = k32.func('bool __stdcall SetEvent(void* h)')
const GetLastError = k32.func('uint32 __stdcall GetLastError()')

function mapView(name, size, access) {
  const h = OpenFileMappingA(access, false, name)
  if (!h) throw new Error(`OpenFileMapping(${name}) failed, error ${GetLastError()}`)
  const ptr = MapViewOfFile(h, access, 0, 0, size)
  if (!ptr) throw new Error(`MapViewOfFile(${name}) failed, error ${GetLastError()}`)
  return koffi.view(ptr, size)
}

const data = new Uint8Array(mapView('LMU_Data', LMU_SIZES.objectOut, FILE_MAP_READ))
// LockData { LONG waiters; LONG busy; }, same protocol as SharedMemoryLock in the header.
const lock = new Int32Array(mapView('LMU_SharedMemoryLockData', 8, FILE_MAP_READ | FILE_MAP_WRITE))
const lockEvent = OpenEventA(EVENT_MODIFY_STATE | SYNCHRONIZE, false, 'LMU_SharedMemoryLockEvent')
const holdEvent = OpenEventA(SYNCHRONIZE, false, 'LMU_Data_HoldEvent')
const dataEvent = OpenEventA(SYNCHRONIZE, false, 'LMU_Data_DataEvent')

function snapshot() {
  let locked = false
  for (let i = 0; i < 4000 && !locked; i++) locked = Atomics.compareExchange(lock, 1, 0, 1) === 0
  if (!locked) return null
  try {
    return Buffer.from(data) // copy
  } finally {
    Atomics.store(lock, 1, 0)
    if (Atomics.load(lock, 0) > 0 && lockEvent) SetEvent(lockEvent)
  }
}

function waitForFrame(ms) {
  if (!holdEvent || !dataEvent) return false
  return WaitForSingleObject(holdEvent, ms) === WAIT_OBJECT_0 && WaitForSingleObject(dataEvent, ms) === WAIT_OBJECT_0
}

function str(buf, off, len) {
  const bytes = buf.subarray(off, off + len)
  const end = bytes.indexOf(0)
  const raw = bytes.subarray(0, end === -1 ? len : end)
  const nonAscii = raw.some((b) => b > 0x7f)
  return nonAscii ? { utf8: raw.toString('utf8'), latin1: raw.toString('latin1') } : raw.toString('ascii')
}

const vec3 = (buf, off) => ({ x: buf.readDoubleLE(off), y: buf.readDoubleLE(off + 8), z: buf.readDoubleLE(off + 16) })

function parseScoringInfo(buf) {
  const b = O.root.scoring + O.scoring.scoringInfo
  const s = O.scoringInfo
  return {
    trackName: str(buf, b + s.mTrackName, 64),
    session: buf.readInt32LE(b + s.mSession),
    currentET: buf.readDoubleLE(b + s.mCurrentET),
    endET: buf.readDoubleLE(b + s.mEndET),
    maxLaps: buf.readInt32LE(b + s.mMaxLaps),
    lapDist: buf.readDoubleLE(b + s.mLapDist),
    numVehicles: buf.readInt32LE(b + s.mNumVehicles),
    gamePhase: buf.readUInt8(b + s.mGamePhase),
    yellowFlagState: buf.readInt8(b + s.mYellowFlagState),
    sectorFlag: [0, 1, 2].map((i) => buf.readInt8(b + s.mSectorFlag + i)),
    inRealtime: buf.readUInt8(b + s.mInRealtime) !== 0,
    playerName: str(buf, b + s.mPlayerName, 32),
    raining: buf.readDoubleLE(b + s.mRaining),
    ambientTemp: buf.readDoubleLE(b + s.mAmbientTemp),
    trackTemp: buf.readDoubleLE(b + s.mTrackTemp),
    gameMode: buf.readUInt8(b + s.mGameMode),
    serverName: str(buf, b + s.mServerName, 32),
    avgPathWetness: buf.readDoubleLE(b + s.mAvgPathWetness),
    sessionTimeRemaining: buf.readFloatLE(b + s.mSessionTimeRemaining),
    trackGripLevel: buf.readUInt8(b + s.mTrackGripLevel),
    trackLimitsStepsPerPenalty: buf.readUInt8(b + s.mTrackLimitsStepsPerPenalty),
    trackLimitsStepsPerPoint: buf.readUInt8(b + s.mTrackLimitsStepsPerPoint)
  }
}

function parseVehScoring(buf, idx) {
  const b = O.root.scoring + O.scoring.vehScoringInfo + idx * LMU_SIZES.vehScoring
  const v = O.vehScoring
  return {
    id: buf.readInt32LE(b + v.mID),
    driverName: str(buf, b + v.mDriverName, 32),
    vehicleName: str(buf, b + v.mVehicleName, 64),
    totalLaps: buf.readInt16LE(b + v.mTotalLaps),
    sector: buf.readInt8(b + v.mSector),
    finishStatus: buf.readInt8(b + v.mFinishStatus),
    lapDist: buf.readDoubleLE(b + v.mLapDist),
    bestLapTime: buf.readDoubleLE(b + v.mBestLapTime),
    lastLapTime: buf.readDoubleLE(b + v.mLastLapTime),
    numPitstops: buf.readInt16LE(b + v.mNumPitstops),
    numPenalties: buf.readInt16LE(b + v.mNumPenalties),
    isPlayer: buf.readUInt8(b + v.mIsPlayer) !== 0,
    control: buf.readInt8(b + v.mControl),
    inPits: buf.readUInt8(b + v.mInPits) !== 0,
    place: buf.readUInt8(b + v.mPlace),
    vehicleClass: str(buf, b + v.mVehicleClass, 32),
    timeBehindNext: buf.readDoubleLE(b + v.mTimeBehindNext),
    lapsBehindNext: buf.readInt32LE(b + v.mLapsBehindNext),
    timeBehindLeader: buf.readDoubleLE(b + v.mTimeBehindLeader),
    lapsBehindLeader: buf.readInt32LE(b + v.mLapsBehindLeader),
    lapStartET: buf.readDoubleLE(b + v.mLapStartET),
    pos: vec3(buf, b + v.mPos),
    localVel: vec3(buf, b + v.mLocalVel),
    pitState: buf.readUInt8(b + v.mPitState),
    timeIntoLap: buf.readDoubleLE(b + v.mTimeIntoLap),
    estimatedLapTime: buf.readDoubleLE(b + v.mEstimatedLapTime),
    pitGroup: str(buf, b + v.mPitGroup, 24),
    flag: buf.readUInt8(b + v.mFlag),
    underYellow: buf.readUInt8(b + v.mUnderYellow) !== 0,
    countLapFlag: buf.readUInt8(b + v.mCountLapFlag),
    inGarageStall: buf.readUInt8(b + v.mInGarageStall) !== 0,
    steamId: buf.readBigUInt64LE(b + v.mSteamID).toString(),
    vehFilename: str(buf, b + v.mVehFilename, 32),
    fuelFraction: buf.readUInt8(b + v.mFuelFraction)
  }
}

function parseWheel(buf, b) {
  const w = O.telemWheel
  return {
    brakeTempC: buf.readDoubleLE(b + w.mBrakeTemp),
    pressureKpa: buf.readDoubleLE(b + w.mPressure),
    temperatureK: [0, 1, 2].map((i) => buf.readDoubleLE(b + w.mTemperature + i * 8)),
    wear: buf.readDoubleLE(b + w.mWear),
    flat: buf.readUInt8(b + w.mFlat) !== 0,
    carcassTempK: buf.readDoubleLE(b + w.mTireCarcassTemperature),
    optimalTemp: buf.readFloatLE(b + w.mOptimalTemp)
  }
}

function parseTelem(buf, idx) {
  const b = O.root.telemetry + O.telemetry.telemInfo + idx * LMU_SIZES.telemInfo
  const t = O.telemInfo
  return {
    id: buf.readInt32LE(b + t.mID),
    elapsedTime: buf.readDoubleLE(b + t.mElapsedTime),
    lapNumber: buf.readInt32LE(b + t.mLapNumber),
    lapStartET: buf.readDoubleLE(b + t.mLapStartET),
    vehicleName: str(buf, b + t.mVehicleName, 64),
    trackName: str(buf, b + t.mTrackName, 64),
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
    currentSector: buf.readInt32LE(b + t.mCurrentSector),
    speedLimiter: buf.readUInt8(b + t.mSpeedLimiter),
    speedLimiterActive: buf.readUInt8(b + t.mSpeedLimiterActive) !== 0,
    maxGears: buf.readUInt8(b + t.mMaxGears),
    rearBrakeBias: buf.readDoubleLE(b + t.mRearBrakeBias),
    deltaBest: buf.readDoubleLE(b + t.mDeltaBest),
    batteryChargeFraction: buf.readDoubleLE(b + t.mBatteryChargeFraction),
    lapInvalidated: buf.readUInt8(b + t.mLapInvalidated) !== 0,
    tc: buf.readUInt8(b + t.mTC),
    abs: buf.readUInt8(b + t.mABS),
    trackLimitsSteps: buf.readUInt8(b + t.mTrackLimitsSteps),
    soc: buf.readFloatLE(b + t.mSoC),
    virtualEnergy: buf.readFloatLE(b + t.mVirtualEnergy),
    timeGapCarAhead: buf.readFloatLE(b + t.mTimeGapCarAhead),
    timeGapCarBehind: buf.readFloatLE(b + t.mTimeGapCarBehind),
    vehicleModel: str(buf, b + t.mVehicleModel, 30),
    vehicleClass: buf.readUInt8(b + t.mVehicleClass),
    wheels: [0, 1, 2, 3].map((i) => parseWheel(buf, b + t.mWheel + i * LMU_SIZES.telemWheel))
  }
}

function parseAll(buf) {
  const g = O.root.generic
  const events = Array.from({ length: LMU_SIZES.eventCount }, (_, i) => buf.readUInt32LE(g + O.generic.events + i * 4))
  const scoringInfo = parseScoringInfo(buf)
  const tb = O.root.telemetry
  const activeVehicles = buf.readUInt8(tb + O.telemetry.activeVehicles)
  const n = Math.max(0, Math.min(scoringInfo.numVehicles, 104))
  return {
    generic: {
      events,
      gameVersion: buf.readInt32LE(g + O.generic.gameVersion),
      optionsLocation: buf.readUInt8(g + O.generic.appInfo + O.appInfo.mOptionsLocation),
      optionsPage: str(buf, g + O.generic.appInfo + O.appInfo.mOptionsPage, 31)
    },
    scoringInfo,
    telemetryHeader: {
      activeVehicles,
      playerVehicleIdx: buf.readUInt8(tb + O.telemetry.playerVehicleIdx),
      playerHasVehicle: buf.readUInt8(tb + O.telemetry.playerHasVehicle) !== 0
    },
    vehicles: Array.from({ length: n }, (_, i) => parseVehScoring(buf, i)),
    telemetry: Array.from({ length: Math.min(activeVehicles, 104) }, (_, i) => parseTelem(buf, i))
  }
}

async function main() {
  console.log(`events: hold=${!!holdEvent} data=${!!dataEvent} lock=${!!lockEvent}`)
  const first = snapshot()
  if (!first) throw new Error('could not acquire shared memory lock')
  const dump = parseAll(first)

  // Sample rates: count distinct scoring (mCurrentET) and player telemetry (mElapsedTime) values.
  const scoringETs = new Set()
  const telemETs = new Set()
  const playerTrace = []
  let frames = 0
  const until = Date.now() + SAMPLE_MS
  while (Date.now() < until) {
    if (!waitForFrame(200)) {
      await new Promise((r) => setTimeout(r, 5))
    }
    const buf = snapshot()
    if (!buf) continue
    frames++
    const p = parseAll(buf)
    scoringETs.add(p.scoringInfo.currentET)
    const idx = p.telemetryHeader.playerVehicleIdx
    const pt = p.telemetry[idx]
    if (pt) {
      telemETs.add(pt.elapsedTime)
      const ps = p.vehicles.find((v) => v.id === pt.id)
      playerTrace.push({ et: pt.elapsedTime, pos: pt.pos, lapDist: ps?.lapDist, lapNumber: pt.lapNumber })
    }
    await new Promise((r) => setImmediate(r))
  }
  dump.sampling = {
    durationMs: SAMPLE_MS,
    framesRead: frames,
    scoringUpdatesPerSec: scoringETs.size / (SAMPLE_MS / 1000),
    playerTelemUpdatesPerSec: telemETs.size / (SAMPLE_MS / 1000),
    playerTrace: playerTrace.filter((_, i) => i % 10 === 0)
  }
  dump.eventIds = LMU_EVENT
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2))
  console.log(`wrote ${outPath}`)
  console.log(`track=${JSON.stringify(dump.scoringInfo.trackName)} session=${dump.scoringInfo.session} vehicles=${dump.scoringInfo.numVehicles} activeTelem=${dump.telemetryHeader.activeVehicles}`)
  console.log(`scoring ${dump.sampling.scoringUpdatesPerSec}/s, telemetry ${dump.sampling.playerTelemUpdatesPerSec}/s`)

  await dumpTrackMaps()
}

// Track maps from the LMU REST API: the loaded layout ("live", only inside a session)
// and every layout from the track list, named by sceneDesc.
async function dumpTrackMaps() {
  fs.mkdirSync(restOutDir, { recursive: true })
  const get = async (route) => {
    const res = await fetch(`${REST_BASE}${route}`)
    if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`)
    return res.json()
  }
  const write = (name, data) => fs.writeFileSync(path.join(restOutDir, `lmu-trackmap-${name}.json`), JSON.stringify(data))

  try {
    const live = await get('/rest/watch/trackmap')
    if (Array.isArray(live)) write('live', live)
    else console.log('no live track map (not in a session)')

    const tracks = await get('/rest/race/track')
    for (const track of tracks) write(track.sceneDesc, await get(`/rest/race/track/${track.id}/trackmap`))
    console.log(`wrote ${tracks.length} track maps to ${restOutDir}`)
  } catch (err) {
    console.error(`track map dump failed: ${err.message}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
