import { parentPort } from 'worker_threads'
import {
  IRacingSDK,
  type DriverInfo,
  type SessionList,
  type SessionResultsPosition,
  type TelemetryVarList,
  type WeekendInfo
} from 'irsdk-node'
import { FakeIRacingSDK } from './irsdkFake'
import { flairNameToIsoCode } from './nationFlags'
import { manufacturerLogoKey } from './manufacturerLogos'
import { estimateIratingChanges } from './iratingCalculator'
import type {
  DriverLapCompletedEvent,
  DriverStanding,
  FlagsData,
  FuelEstimate,
  FuelLapEstimate,
  RelativeData,
  RelativeDriver,
  StandingsClass,
  StandingsData,
  TelemetryData,
  TireWheelData,
  TiresData,
  TrackMapData,
  TrackMapDriver,
  TrackSurfaceStatus
} from '../shared/types'
import type { IrsdkWorkerCommand, IrsdkWorkerMessage } from './irsdkWorkerMessages'

// Runs as its own worker thread (see irsdkService.ts). waitForData() is a
// blocking native call that's effectively busy almost constantly while
// iRacing runs (~60 fps). In the Electron main process that would visibly
// stall the window.

const POLL_INTERVAL_MS = 1000 / 30 // 30 Hz
const RECONNECT_INTERVAL_MS = 2000

// number of drivers to display around the driver in focus and for class leaders
let relativeAhead = 3
let relativeBehind = 3
let standingsAhead = 3
let standingsBehind = 3
let standingsTopCount = 3

parentPort?.on('message', (command: IrsdkWorkerCommand) => {
  switch (command.type) {
    case 'set-relative-window':
      relativeAhead = command.ahead
      relativeBehind = command.behind
      break
    case 'set-standings-window':
      standingsAhead = command.ahead
      standingsBehind = command.behind
      standingsTopCount = command.topCount
      break
  }
})

function post(message: IrsdkWorkerMessage): void {
  parentPort?.postMessage(message)
}

interface IrsdkLike {
  startSDK(): boolean
  waitForData(timeoutMs?: number): boolean
  getTelemetry(): TelemetryVarList
  getDriverInfo(): DriverInfo | null
  getWeekendInfo(): WeekendInfo | null
  getSessionInfo(): SessionList | null
}

const useFakeSdk = process.env.IRSDK_MOCK === '1'
if (useFakeSdk) {
  console.log('[irsdk] IRSDK_MOCK=1 - using FakeIRacingSDK instead of the real iRacing connection')
}

// Screenshot/README mode: keeps using real telemetry,
// but swaps every other driver's name for a random fake one, so no real.
// Own car keeps its real name.
const anonymizeNames = process.env.ANONYMIZE_DRIVER_NAMES === '1'
if (anonymizeNames) {
  console.log('[irsdk] ANONYMIZE_DRIVER_NAMES=1 - replacing other drivers\' names with random fake ones')
}

const ANON_FIRST_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Casey', 'Morgan', 'Taylor', 'Riley', 'Jamie', 'Drew', 'Cameron',
  'Avery', 'Reese', 'Skyler', 'Quinn', 'Rowan', 'Blake', 'Emerson', 'Hayden', 'Parker', 'Sawyer'
]
const ANON_LAST_NAMES = [
  'Turner', 'Bishop', 'Cole', 'Reed', 'Hayes', 'Foster', 'Price', 'Sloane', 'Vance', 'Marsh',
  'Kerr', 'Doyle', 'Lang', 'Brady', 'Nash', 'Voss', 'Kane', 'Rhodes', 'Pierce', 'Wade'
]

const fakeNameByCarIdx = new Map<number, string>()
const usedFakeNames = new Set<string>()

function fakeNameFor(carIdx: number): string {
  const cached = fakeNameByCarIdx.get(carIdx)
  if (cached) return cached

  let name = ''
  for (let attempts = 0; attempts < 20; attempts++) {
    const first = ANON_FIRST_NAMES[Math.floor(Math.random() * ANON_FIRST_NAMES.length)]
    const last = ANON_LAST_NAMES[Math.floor(Math.random() * ANON_LAST_NAMES.length)]
    name = `${first} ${last}`
    if (!usedFakeNames.has(name)) break
  }

  usedFakeNames.add(name)
  fakeNameByCarIdx.set(carIdx, name)
  return name
}

function displayDriverName(carIdx: number, ownCarIdx: number, realName: string): string {
  if (!anonymizeNames || carIdx === ownCarIdx) return realName
  return fakeNameFor(carIdx)
}

const sdk: IrsdkLike = useFakeSdk ? new FakeIRacingSDK() : new IRacingSDK({ autoEnableTelemetry: true })
sdk.startSDK()

let wasConnected = false
let lastStartAttempt = Date.now()
let loggedFirstAttempt = false

function loop(): void {
  const hasData = sdk.waitForData(POLL_INTERVAL_MS)

  if (hasData) {
    if (!wasConnected) {
      wasConnected = true
      console.log('[irsdk] connected, receiving telemetry')
      post({ type: 'connected' })
    }
    publishTelemetry()
  } else {
    if (wasConnected) {
      wasConnected = false
      console.log('[irsdk] connection lost')
      post({ type: 'disconnected' })
    }

    const now = Date.now()
    if (now - lastStartAttempt > RECONNECT_INTERVAL_MS) {
      lastStartAttempt = now
      if (!loggedFirstAttempt) {
        loggedFirstAttempt = true
        console.log('[irsdk] no data yet, retrying attach...')
      }
      sdk.startSDK()
    }
  }

  setImmediate(loop)
}

function publishTelemetry(): void {
  const raw = sdk.getTelemetry()
  const driver = sdk.getDriverInfo()
  if (!raw) return

  updateStintTracking(raw)

  post({ type: 'telemetry', data: buildTelemetry(raw, driver) })
  post({ type: 'standings', data: buildStandings(raw) })
  post({ type: 'relative', data: buildRelative(raw) })
  post({ type: 'trackmap', data: buildTrackMap(raw) })
  post({ type: 'flags', data: buildFlags(raw) })

  const lapCompletions = checkLapCompletions(raw)
  if (lapCompletions.length > 0) post({ type: 'lap-completed', events: lapCompletions })

  maybeSendSessionHeartbeat(raw)
}

const SESSION_HEARTBEAT_INTERVAL_MS = 10_000 // enough to keep the driver-history expiry date fresh
let lastSessionHeartbeatAt = 0

// Sends remaining session time main process (not every 30Hz tick), 
// so driverStatsStore.ts can pushing back driver-history expiry date as long as telemetry is coming in
function maybeSendSessionHeartbeat(raw: TelemetryVarList): void {
  const now = Date.now()
  if (now - lastSessionHeartbeatAt < SESSION_HEARTBEAT_INTERVAL_MS) return
  lastSessionHeartbeatAt = now

  const sessionTimeRemainSec = raw.SessionTimeRemain?.value?.[0] ?? 0
  post({ type: 'session-heartbeat', sessionTimeRemainSec })
}

const lastLapsCompletedByCarIdx = new Map<number, number>()

// Sum/count of every lap time recorded this session, keyed by Driver.UserID.
const lapTimeStatsByCustId = new Map<number, { sum: number; count: number }>()
let lastLapStatsSessionNum: number | null = null

function checkLapCompletions(raw: TelemetryVarList): DriverLapCompletedEvent[] {
  const driverInfo = sdk.getDriverInfo()
  const weekendInfo = sdk.getWeekendInfo()
  const sessionInfo = sdk.getSessionInfo()

  const laps = raw.CarIdxLapCompleted?.value ?? []
  const lastLapTimes = raw.CarIdxLastLapTime?.value ?? []
  const currentSessionNum = raw.SessionNum?.value?.[0] ?? 0
  const sessionType = sessionInfo?.Sessions?.find((s) => s.SessionNum === currentSessionNum)?.SessionType ?? ''
  const trackId = weekendInfo?.TrackID ?? -1
  const trackName = weekendInfo?.TrackDisplayName ?? ''

  // Average lap time is scoped to the current session only, e.g. switching
  // from Qualify to Race must not carry qualifying laps into the race average.
  if (lastLapStatsSessionNum !== null && currentSessionNum !== lastLapStatsSessionNum) {
    lapTimeStatsByCustId.clear()
  }
  lastLapStatsSessionNum = currentSessionNum

  const events: DriverLapCompletedEvent[] = []

  for (const driver of driverInfo?.Drivers ?? []) {
    if (driver.IsSpectator || driver.CarIsPaceCar) continue

    const carIdx = driver.CarIdx
    const current = laps[carIdx] ?? 0
    const previous = lastLapsCompletedByCarIdx.get(carIdx)

    if (previous !== undefined && current > previous) {
      const lapTimeSec = lastLapTimes[carIdx] ?? -1
      if (lapTimeSec > 0) {
        const stats = lapTimeStatsByCustId.get(driver.UserID) ?? { sum: 0, count: 0 }
        stats.sum += lapTimeSec
        stats.count += 1
        lapTimeStatsByCustId.set(driver.UserID, stats)

        events.push({
          custId: driver.UserID,
          driverName: driver.UserName,
          entry: {
            lapTimeSec,
            trackId,
            trackName,
            carId: driver.CarID,
            carName: driver.CarScreenName,
            sessionType,
            recordedAt: Date.now()
          }
        })
      }
    }

    lastLapsCompletedByCarIdx.set(carIdx, current)
  }

  return events
}

// -1 = no lap recorded yet for this driver this session (or no driver at all).
function avgLapTimeSec(custId: number | undefined): number {
  if (custId === undefined) return -1
  const stats = lapTimeStatsByCustId.get(custId)
  if (!stats || stats.count === 0) return -1
  return stats.sum / stats.count
}

// irsdk_TrkLoc enum value for "sitting in own pit stall"
const TRK_LOC_IN_PIT_STALL = 1

// Tracks last completed-lap count when a car is pitting,
// stays frozen after leaving pits and marks start of current stint
// No entry this session => stint counts from session start
const lastPitLapByCarIdx = new Map<number, number>()
let lastStintSessionNum: number | null = null

function updateStintTracking(raw: TelemetryVarList): void {
  const driverInfo = sdk.getDriverInfo()
  const laps = raw.CarIdxLapCompleted?.value ?? []
  const trackSurface = raw.CarIdxTrackSurface?.value ?? []
  const sessionNum = raw.SessionNum?.value?.[0] ?? 0

  // reset on new session
  if (lastStintSessionNum !== null && sessionNum !== lastStintSessionNum) {
    lastPitLapByCarIdx.clear()
  }
  lastStintSessionNum = sessionNum

  for (const driver of driverInfo?.Drivers ?? []) {
    if (driver.IsSpectator || driver.CarIsPaceCar) continue
    const carIdx = driver.CarIdx
    if (trackSurface[carIdx] === TRK_LOC_IN_PIT_STALL) {
      lastPitLapByCarIdx.set(carIdx, laps[carIdx] ?? 0)
    }
  }
}

function stintLaps(carIdx: number, lapsCompleted: number): number {
  return Math.max(0, lapsCompleted - (lastPitLapByCarIdx.get(carIdx) ?? 0))
}

const ZERO_WHEEL: TireWheelData = { wearPct: 0, tempC: 0, tempUnit: 'C' }
const ZERO_TIRES: TiresData = { lf: ZERO_WHEEL, rf: ZERO_WHEEL, lr: ZERO_WHEEL, rr: ZERO_WHEEL }

// Wear/temp are only exposed by the SDK for our own car,
// and each corner comes as 3 separate zones (inner/middle/outer).
// Averaged here into one value per corner.
function buildTireWheel(raw: TelemetryVarList, prefix: 'LF' | 'RF' | 'LR' | 'RR'): TireWheelData {
  const wearL = raw[`${prefix}wearL`]?.value?.[0] ?? 0
  const wearM = raw[`${prefix}wearM`]?.value?.[0] ?? 0
  const wearR = raw[`${prefix}wearR`]?.value?.[0] ?? 0
  const tempL = raw[`${prefix}tempCL`]?.value?.[0] ?? 0
  const tempM = raw[`${prefix}tempCM`]?.value?.[0] ?? 0
  const tempR = raw[`${prefix}tempCR`]?.value?.[0] ?? 0
  const tempUnit = raw[`${prefix}tempCL`]?.unit ?? 'C'

  return {
    wearPct: ((wearL + wearM + wearR) / 3) * 100, // SDK gives 0..1 despite its "%" unit label
    tempC: (tempL + tempM + tempR) / 3,
    tempUnit: tempUnit
  }
}

function buildTires(raw: TelemetryVarList): TiresData {
  return {
    lf: buildTireWheel(raw, 'LF'),
    rf: buildTireWheel(raw, 'RF'),
    lr: buildTireWheel(raw, 'LR'),
    rr: buildTireWheel(raw, 'RR')
  }
}

const NO_TELEMETRY: TelemetryData = {
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
  lap: 0,
  lapDistPct: 0,
  isOnTrack: false,
  lapCurrentTime: -1,
  lapLastTime: -1,
  lapBestTime: -1,
  lapDeltaToBest: 0,
  lapDeltaToBestValid: false,
  isOnPitRoad: false,
  incidentCount: 0,
  isSpectatingOther: false,
  fuelEstimate: null,
  currentDriverIncidentCount: -1,
  teamIncidentCount: -1,
  incidentLimit: '',
  tires: ZERO_TIRES
}

// iRacing provides neither consumption-per-lap nor a range estimate, only own-car FuelLevel.
// Computed here by comparing FuelLevel at the start of each lap to get that lap's consumption.
const FUEL_HISTORY_SIZE = 5 // for the "average of the last 5 laps" value
let lastFuelLapSample: { lap: number; fuelLevel: number } | null = null
let fuelPerLapHistory: number[] = [] // oldest first, at most FUEL_HISTORY_SIZE entries

function trackFuelConsumption(raw: TelemetryVarList): void {
  const isDriving = raw.IsOnTrack?.value?.[0] ?? false
  if (!isDriving) {
    // Not in our own car = no FuelLevel available.
    // Discard old sample, so getting back in doesn't compare it against long-stale value
    lastFuelLapSample = null
    return
  }

  const lap = raw.Lap?.value?.[0] ?? 0
  const fuelLevel = raw.FuelLevel?.value?.[0] ?? 0

  if (lastFuelLapSample === null) {
    lastFuelLapSample = { lap, fuelLevel }
    return
  }

  if (lap === lastFuelLapSample.lap) return

  if (lap > lastFuelLapSample.lap) {
    const consumed = lastFuelLapSample.fuelLevel - fuelLevel
    // Refueled during the lap (pit stop) = not representative per-lap
    // consumption, so don't add it to the history
    if (consumed > 0) {
      fuelPerLapHistory.push(consumed)
      if (fuelPerLapHistory.length > FUEL_HISTORY_SIZE) fuelPerLapHistory.shift()
    }
  } else {
    // Lap counter dropping (= new session/new stint) discards the history
    fuelPerLapHistory = []
  }

  // New lap just started, this fuel level is the baseline for it.
  lastFuelLapSample = { lap, fuelLevel }
}

function buildFuelLapEstimate(
  consumptionPerLapL: number,
  fuelLevelL: number,
  lapStartFuelLevelL: number,
  currentLap: number
): FuelLapEstimate | null {
  if (consumptionPerLapL <= 0) return null

  // margin/pitByLap deliberately use lapStartFuelLevelL (a stable snapshot),
  // not the live fuelLevelL, see FuelLapEstimate's doc comment for why.
  const fullLapsRemaining = Math.floor(lapStartFuelLevelL / consumptionPerLapL)

  return {
    consumptionPerLapL,
    lapsRemaining: fuelLevelL / consumptionPerLapL,
    marginLiters: lapStartFuelLevelL - fullLapsRemaining * consumptionPerLapL,
    pitByLap: currentLap + fullLapsRemaining + 1
  }
}

// Sanity ceilings for "this dimension doesn't actually limit the session"
// (e.g. SessionLapsRemainEx in a purely time-limited race, or SessionTimeRemain
// in a purely lap-limited one). Not verified against iRacing's exact sentinel
// values for those cases, just defensive caps well beyond any real race.
const UNLIMITED_LAPS_THRESHOLD = 100_000
const UNLIMITED_SECONDS_THRESHOLD = 24 * 60 * 60 // 24h, longer than any real enduro

// Whether the session has a real end at all (a lap or time limit). Checked
// directly on the raw SDK fields, independent of whether we can currently
// price that in as a lap count (the leader's pace might not be known yet
// early in a session, that's a separate "unknown pace" case, see
// leaderLapTimeSec()).
function sessionHasRealEnd(raw: TelemetryVarList): boolean {
  const lapsByCount = raw.SessionLapsRemainEx?.value?.[0] ?? Number.POSITIVE_INFINITY
  const timeRemainSec = raw.SessionTimeRemain?.value?.[0] ?? Number.POSITIVE_INFINITY
  return lapsByCount < UNLIMITED_LAPS_THRESHOLD || timeRemainSec < UNLIMITED_SECONDS_THRESHOLD
}

// Race leader's own pace, the one that actually determines when the
// checkered flag comes out, regardless of whose estimate we're computing.
// Falls back to their best lap early in a run/out-lap, and if they haven't
// set ANY lap time yet (e.g. still on their out-lap), to CarClassEstLapTime,
// the SDK's own estimated lap time for their car class, available from the
// start of the session rather than only once a lap has actually been driven.
// -1 only if there's no leader entry at all to look any of this up on.
function leaderLapTimeSec(raw: TelemetryVarList, driverInfo: DriverInfo | null): number {
  const leaderCarIdx = raw.CarIdxPosition?.value?.findIndex((p) => p === 1) ?? -1
  if (leaderCarIdx < 0) return -1

  const measured = raw.CarIdxLastLapTime?.value?.[leaderCarIdx] ?? raw.CarIdxBestLapTime?.value?.[leaderCarIdx] ?? -1
  if (measured > 0) return measured

  const estimate = driverInfo?.Drivers?.find((d) => d.CarIdx === leaderCarIdx)?.CarClassEstLapTime ?? -1
  return estimate > 0 ? estimate : -1
}

// Real-world seconds left before the session ends, covering both lap- and
// time-limited races. SessionLapsRemainEx is tied to the race LEADER
// crossing the line, not to our own lap count, so if we're a lap (or more)
// behind, that many "laps to go" corresponds to MORE real seconds than the
// same number of our own laps would take. Converted via the leader's own
// pace (not ours) before comparing against SessionTimeRemain (already real
// seconds), whichever ends the session sooner wins.
function estimateSecondsRemaining(raw: TelemetryVarList, driverInfo: DriverInfo | null): number {
  const lapsByCount = raw.SessionLapsRemainEx?.value?.[0] ?? Number.POSITIVE_INFINITY
  const timeRemainSec = raw.SessionTimeRemain?.value?.[0] ?? Number.POSITIVE_INFINITY

  const leaderPace = leaderLapTimeSec(raw, driverInfo)
  const secondsByLaps = Number.isFinite(lapsByCount) && leaderPace > 0
    ? lapsByCount * leaderPace
    : Number.POSITIVE_INFINITY

  return Math.min(secondsByLaps, timeRemainSec)
}

// Laps WE will still drive before the session ends. Real seconds remaining
// (see estimateSecondsRemaining()) converted via OUR OWN pace, since that's
// what determines how many more laps we personally get to complete (and
// therefore how much fuel we still need). null if the session has no real
// end (see sessionHasRealEnd()) or without a usable pace of our own yet.
function estimateLapsRemaining(raw: TelemetryVarList, driverInfo: DriverInfo | null, lastLapTimeSec: number): number | null {
  if (lastLapTimeSec <= 0 || !sessionHasRealEnd(raw)) return null

  const secondsRemaining = estimateSecondsRemaining(raw, driverInfo)
  if (!Number.isFinite(secondsRemaining)) return null

  return secondsRemaining / lastLapTimeSec
}

// "Laps to go" for the race as a whole (leader-anchored), e.g. for the
// Standings header, shown regardless of who's focused/spectating. Same real
// seconds remaining as estimateLapsRemaining(), just converted back via the
// LEADER's own pace instead of a specific driver's. null if the session has
// no real end at all (hide the display), NOT if the leader simply hasn't
// set a real lap time yet (leaderLapTimeSec() covers that with its own
// CarClassEstLapTime fallback instead).
function estimateRaceLapsRemaining(raw: TelemetryVarList, driverInfo: DriverInfo | null): number | null {
  if (!sessionHasRealEnd(raw)) return null

  const pace = leaderLapTimeSec(raw, driverInfo)
  if (pace <= 0) return null

  const secondsRemaining = estimateSecondsRemaining(raw, driverInfo)
  if (!Number.isFinite(secondsRemaining)) return null

  return secondsRemaining / pace
}

// Additional pit stops needed for fuel before the session ends, assuming a
// full refill every stop, the simplest strategy, and the only one possible
// without knowing the driver's actual planned fill amounts ahead of time.
function estimateStopsRemaining(
  raw: TelemetryVarList,
  driver: DriverInfo | null,
  consumptionPerLapL: number,
  fuelLevelL: number,
  lastLapTimeSec: number
): number | null {
  if (consumptionPerLapL <= 0) return null

  const lapsRemaining = estimateLapsRemaining(raw, driver, lastLapTimeSec)
  if (lapsRemaining === null) return null

  // DriverCarMaxFuelPct despite its "%" unit label is a 0..1 fraction (like
  // FuelLevelPct, see irsdkFake.ts). 0 means the event doesn't restrict fuel
  // load below the car's physical tank size.
  const tankMaxL = driver?.DriverCarFuelMaxLtr ?? 0
  const maxFuelPct = driver?.DriverCarMaxFuelPct ?? 0
  const tankCapacityL = maxFuelPct > 0 ? tankMaxL * maxFuelPct : tankMaxL
  if (tankCapacityL <= 0) return null

  const fuelNeededL = lapsRemaining * consumptionPerLapL - fuelLevelL
  return Math.max(0, Math.ceil(fuelNeededL / tankCapacityL))
}

function buildFuelEstimate(
  raw: TelemetryVarList,
  driver: DriverInfo | null,
  fuelLevelL: number,
  currentLap: number
): FuelEstimate | null {
  if (fuelPerLapHistory.length === 0) return null

  // Fuel level as of this lap's start (tracked in trackFuelConsumption()).
  // Falls back to the live level if unavailable, e.g. right after getting
  // back in the car.
  const lapStartFuelLevelL = lastFuelLapSample?.fuelLevel ?? fuelLevelL

  const lastLapConsumption = fuelPerLapHistory[fuelPerLapHistory.length - 1]
  const avgConsumption = fuelPerLapHistory.reduce((sum, v) => sum + v, 0) / fuelPerLapHistory.length
  // No dedicated "current pace" telemetry var, last completed lap is the
  // closest estimate, falling back to the best lap early in a run/out-lap.
  const lastLapTimeSec = raw.LapLastLapTime?.value?.[0] ?? raw.LapBestLapTime?.value?.[0] ?? -1

  return {
    lastLap: buildFuelLapEstimate(lastLapConsumption, fuelLevelL, lapStartFuelLevelL, currentLap),
    avgLast5: buildFuelLapEstimate(avgConsumption, fuelLevelL, lapStartFuelLevelL, currentLap),
    // Own car only, straight passthrough of iRacing's own pit service menu
    // value, live-tracks "Auto Fill" if the driver enabled it there,
    // otherwise whatever amount is currently dialed in manually.
    nextPitFuelL: raw.PitSvFuel?.value?.[0] ?? null,
    // Uses the average-of-5 consumption rather than last-lap: this projects
    // across many remaining laps, so a stable rate matters more here than
    // reacting fast to a single outlier lap.
    stopsRemaining: estimateStopsRemaining(raw, driver, avgConsumption, fuelLevelL, lastLapTimeSec)
  }
}

// e.g. Driver.LicColor and Driver.CarClassColor
function sdkColorHex(raw: number | undefined): string {
  return '#' + ((raw ?? 0) & 0xffffff).toString(16).padStart(6, '0')
}

function driverFlagIsoCode(driver: unknown): string | null {
  return flairNameToIsoCode((driver as { FlairName?: string } | undefined)?.FlairName)
}

function trackLengthMeters(weekendInfo: WeekendInfo | null): number {
  const match = (weekendInfo?.TrackLength ?? '').match(/([\d.]+)\s*(km|mi)/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  return match[2].toLowerCase() === 'mi' ? value * 1609.344 : value * 1000
}

let lastSpeedSample: { carIdx: number; lapDistPct: number; sessionTime: number } | null = null

// No CarIdxSpeed in the SDK
// Speed is estimated from the change in track position (CarIdxLapDistPct) between two ticks.
function estimateSpeedKph(carIdx: number, raw: TelemetryVarList, trackMeters: number): number {
  const lapDistPct = raw.CarIdxLapDistPct?.value?.[carIdx] ?? -1
  const sessionTime = raw.SessionTime?.value?.[0] ?? 0
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

function buildTelemetry(raw: TelemetryVarList, driver: DriverInfo|null): TelemetryData {
  const rawPlayerCarIdx = raw.PlayerCarIdx?.value?.[0] ?? -1
  const isDriving = raw.IsOnTrack?.value?.[0] ?? false

  // Must run every tick to reset history.
  trackFuelConsumption(raw)

  // Always our OWN car/team, regardless of camera focus (CamCarIdx)
  const currentDriverIncidentCount = raw.PlayerCarDriverIncidentCount?.value?.[0] ?? -1
  const teamIncidentCount = raw.PlayerCarTeamIncidentCount?.value?.[0] ?? -1
  const incidentLimit = sdk.getWeekendInfo()?.WeekendOptions?.IncidentLimit ?? ''

  if (isDriving) {
    const fuelLevelL = raw.FuelLevel?.value?.[0] ?? 0
    const lap = raw.Lap?.value?.[0] ?? 0

    return {
      speedKph: (raw.Speed?.value?.[0] ?? 0) * 3.6, // irsdk gives m/s
      rpm: raw.RPM?.value?.[0] ?? 0,
      rpmIdle: driver?.DriverCarIdleRPM ?? -1,
      rpmSLFirst: driver?.DriverCarSLFirstRPM ?? -1,
      rpmSLShift: driver?.DriverCarSLShiftRPM ?? -1,
      rpmSLLast: driver?.DriverCarSLLastRPM ?? -1,
      rpmSLBlink: driver?.DriverCarSLBlinkRPM ?? -1,
      gear: raw.Gear?.value?.[0] ?? 0,
      throttlePct: raw.Throttle?.value?.[0] ?? 0,
      brakePct: raw.Brake?.value?.[0] ?? 0,
      // SDK gives Clutch as "how engaged" (0=disengaged/pressed, 1=fully engaged/released)
      // here inverted to match the throttlePct/brakePct convention.
      clutchPct: 1 - (raw.Clutch?.value?.[0] ?? 1),
      fuelLevelL,
      lap,
      lapDistPct: raw.LapDistPct?.value?.[0] ?? 0,
      isOnTrack: true,
      lapCurrentTime: raw.LapCurrentLapTime?.value?.[0] ?? -1,
      lapLastTime: raw.LapLastLapTime?.value?.[0] ?? -1,
      lapBestTime: raw.LapBestLapTime?.value?.[0] ?? -1,
      lapDeltaToBest: raw.LapDeltaToBestLap?.value?.[0] ?? 0,
      lapDeltaToBestValid: raw.LapDeltaToBestLap_OK?.value?.[0] ?? false,
      isOnPitRoad: raw.OnPitRoad?.value?.[0] ?? false,
      incidentCount: raw.PlayerCarMyIncidentCount?.value?.[0] ?? 0,
      isSpectatingOther: false,
      fuelEstimate: buildFuelEstimate(raw, driver, fuelLevelL, lap),
      currentDriverIncidentCount,
      teamIncidentCount,
      incidentLimit,
      tires: buildTires(raw)
    }
  }

  // When spectating / not in car.
  // Show speed/RPM/gear/lap times for the currently watched car (CamCarIdx),
  // where the SDK provides per-vehicle data.
  // Pedal inputs and fuel level stay 0.
  const focusCarIdx = resolveFocusCarIdx(raw, rawPlayerCarIdx)
  if (focusCarIdx < 0) return NO_TELEMETRY

  const driverInfo = sdk.getDriverInfo()
  const focusDriver = driverInfo?.Drivers?.find((d) => d.CarIdx === focusCarIdx)
  const trackMeters = trackLengthMeters(sdk.getWeekendInfo())

  return {
    speedKph: estimateSpeedKph(focusCarIdx, raw, trackMeters),
    rpm: raw.CarIdxRPM?.value?.[focusCarIdx] ?? 0,
    rpmIdle: -1,
    rpmSLFirst: -1,
    rpmSLShift: -1,
    rpmSLLast: -1,
    rpmSLBlink: -1,
    gear: raw.CarIdxGear?.value?.[focusCarIdx] ?? 0,
    throttlePct: 0,
    brakePct: 0,
    clutchPct: 0,
    fuelLevelL: 0,
    lap: raw.CarIdxLap?.value?.[focusCarIdx] ?? 0,
    lapDistPct: raw.CarIdxLapDistPct?.value?.[focusCarIdx] ?? 0,
    isOnTrack: true,
    // No exact "current lap time" available per vehicle,
    // time since the last start/finish crossing is closest approximation.
    lapCurrentTime: raw.CarIdxEstTime?.value?.[focusCarIdx] ?? -1,
    lapLastTime: raw.CarIdxLastLapTime?.value?.[focusCarIdx] ?? -1,
    lapBestTime: raw.CarIdxBestLapTime?.value?.[focusCarIdx] ?? -1,
    // No precise delta-to-best-lap per track point possible,
    // iRacing only computes that internally for our own car
    lapDeltaToBest: 0,
    lapDeltaToBestValid: false,
    // Tires aren't meaningful while spectating anyway (see ZERO_TIRES below).
    isOnPitRoad: false,
    // iRacing reports CurDriverIncidentCount as -1 for other drivers,
    // pass -1 through rather than normalizing to 0,
    // so UI can distinguish "unavailable" from "0 incidents".
    incidentCount: focusDriver?.CurDriverIncidentCount ?? -1,
    isSpectatingOther: true,
    fuelEstimate: null,
    currentDriverIncidentCount,
    teamIncidentCount,
    incidentLimit,
    tires: ZERO_TIRES
  }
}

// When not actively driving own car, Standings and Relative
// should focus on car the camera is following (CamCarIdx).
// While driving, focus always stays on own car.
function resolveFocusCarIdx(raw: TelemetryVarList, rawPlayerCarIdx: number): number {
  const isDriving = raw.IsOnTrack?.value?.[0] ?? false
  if (isDriving) return rawPlayerCarIdx

  const camCarIdx = raw.CamCarIdx?.value?.[0] ?? -1
  return camCarIdx >= 0 ? camCarIdx : rawPlayerCarIdx
}

interface RankedStandingsClass {
  classId: number
  className: string
  driverCount: number
  strengthOfField: number
  drivers: DriverStanding[]
}

function computeRankedClasses(raw: TelemetryVarList): RankedStandingsClass[] {
  const driverInfo = sdk.getDriverInfo()
  const sessionInfo = sdk.getSessionInfo()
  const rawPlayerCarIdx = raw.PlayerCarIdx?.value?.[0] ?? -1
  const playerCarIdx = resolveFocusCarIdx(raw, rawPlayerCarIdx)
  const currentSessionNum = raw.SessionNum?.value?.[0] ?? 0

  const positions = raw.CarIdxPosition?.value ?? []
  const laps = raw.CarIdxLapCompleted?.value ?? []
  const lapDistPct = raw.CarIdxLapDistPct?.value ?? []
  // TODO SDK doc only says "race time behind leader", not verified whether this
  //  is scoped to the car's own class or the overall race leader in a
  //  multiclass session
  const gapToLeader = raw.CarIdxF2Time?.value ?? []
  const bestLapTimes = raw.CarIdxBestLapTime?.value ?? []
  const playerCarPosition = raw.PlayerCarPosition?.value?.[0] ?? 0

  // Official session results stays for a driver once they've
  // set a valid time, even after they've left the server
  const currentSession = sessionInfo?.Sessions?.find((s) => s.SessionNum === currentSessionNum)
  const resultsByCarIdx = new Map<number, SessionResultsPosition>(
    (currentSession?.ResultsPositions ?? []).map((r) => [r.CarIdx, r])
  )

  const driverByCarIdx = new Map((driverInfo?.Drivers ?? []).map((d) => [d.CarIdx, d]))

  // Roster = all currently connected drivers (excluding spectators/pace car).
  // UNION all CarIdx from the session results, so drivers missing (e.g. IsSpectator)
  // are being added to the list (with less data).
  const carIdxs = new Set<number>()
  for (const driver of driverInfo?.Drivers ?? []) {
    if (!driver.IsSpectator && !driver.CarIsPaceCar) carIdxs.add(driver.CarIdx)
  }
  for (const carIdx of resultsByCarIdx.keys()) carIdxs.add(carIdx)

  const rows = Array.from(carIdxs).map((carIdx) => {
    const driver = driverByCarIdx.get(carIdx)
    const result = resultsByCarIdx.get(carIdx)
    const isPlayer = carIdx === playerCarIdx
    const isOwnCar = carIdx === rawPlayerCarIdx

    // "PlayerCarPosition" always refers to own car
    const livePosition = isOwnCar && playerCarPosition > 0 ? playerCarPosition : (positions[carIdx] ?? 0)
    const hasLivePosition = livePosition > 0
    const position = hasLivePosition ? livePosition : (result?.Position ?? 0)
    const lapsCompleted = laps[carIdx] > 0 ? laps[carIdx] : (result?.LapsComplete ?? laps[carIdx] ?? 0)
    const bestLapTime =
      (bestLapTimes[carIdx] ?? -1) > 0 ? bestLapTimes[carIdx] : (result?.FastestTime ?? bestLapTimes[carIdx] ?? -1)

    return {
      carIdx,
      position,
      hasLivePosition,
      carNumber: driver?.CarNumber ?? '?',
      driverName: displayDriverName(carIdx, rawPlayerCarIdx, driver?.UserName ?? `Driver #${carIdx}`),
      lapsCompleted,
      stintLaps: stintLaps(carIdx, lapsCompleted),
      lapDistPct: lapDistPct[carIdx] ?? 0,
      gapToLeaderSec: gapToLeader[carIdx] ?? 0,
      bestLapTime,
      isPlayer,
      classId: driver?.CarClassID ?? 0,
      className: driver?.CarClassShortName ?? '?',
      iRating: driver?.IRating ?? 0,
      licString: driver?.LicString ?? '',
      licColorHex: sdkColorHex(driver?.LicColor),
      classColorHex: sdkColorHex(driver?.CarClassColor),
      avgLapTimeSec: avgLapTimeSec(driver?.UserID),
      flagIsoCode: driverFlagIsoCode(driver),
      manufacturerLogoKey: manufacturerLogoKey(driver?.CarScreenName)
    }
  })

  const isRaceSession = (currentSession?.SessionType ?? '').toLowerCase().includes('race')

  // Position, gap, and ranking order must all be computed per class for multiclass races.
  const rowsByClass = new Map<number, StandingsRow[]>()
  for (const row of rows) {
    const list = rowsByClass.get(row.classId)
    if (list) list.push(row)
    else rowsByClass.set(row.classId, [row])
  }

  return Array.from(rowsByClass.entries()).map(([classId, classRows]) => {
    const drivers = isRaceSession ? buildRacePositions(classRows) : buildTimeRanking(classRows)

    // Fastest valid best-lap time WITHIN this class
    const classFastestLapTime = Math.min(...drivers.map((d) => d.bestLapTime).filter((t) => t > 0))

    // iRating changes only apply to actual races. Drivers are already in
    // class-position order (index 0 = P1) here, matching what
    // estimateIratingChanges() expects.
    const iRatingChanges = isRaceSession
      ? estimateIratingChanges(drivers.map((d) => d.iRating))
      : drivers.map(() => null)

    const driversWithFastestFlag = drivers.map((d, i) => ({
      ...d,
      isClassFastestLap: d.bestLapTime > 0 && d.bestLapTime === classFastestLapTime,
      iRatingChange: iRatingChanges[i]
    }))

    return {
      classId,
      className: classRows[0]?.className ?? '?',
      driverCount: classRows.length,
      strengthOfField: computeStrengthOfField(classRows.map((row) => row.iRating)),
      drivers: driversWithFastestFlag
    }
  })
}

interface ClassPositionInfo {
  position: number
  iRatingChange: number | null
}

// Position + iRating-change estimate per car, both derived from the same
// per-class ranking (see computeRankedClasses()).
function computeClassPositions(raw: TelemetryVarList): Map<number, ClassPositionInfo> {
  const infoByCarIdx = new Map<number, ClassPositionInfo>()
  for (const cls of computeRankedClasses(raw)) {
    for (const driver of cls.drivers) {
      infoByCarIdx.set(driver.carIdx, { position: driver.position, iRatingChange: driver.iRatingChange })
    }
  }
  return infoByCarIdx
}

function buildStandings(raw: TelemetryVarList): StandingsData {
  const weekendInfo = sdk.getWeekendInfo()
  const sessionInfo = sdk.getSessionInfo()
  const driverInfo = sdk.getDriverInfo()

  const rankedClasses = computeRankedClasses(raw)
  const hasPlayerAnywhere = rankedClasses.some((cls) => cls.drivers.some((d) => d.isPlayer))

  const classes: StandingsClass[] = rankedClasses
    .map((cls) => ({ ...cls, drivers: filterStandingsWindow(cls.drivers, hasPlayerAnywhere) }))
    // Strongest (fastest) class first, matching iRacing's own multiclass results ordering.
    .sort((a, b) => b.strengthOfField - a.strengthOfField)

  const sessionTimeRemain = raw?.SessionTimeRemain?.value?.[0] ?? 0
  const trackTemp = raw?.TrackTempCrew?.value?.[0] ?? 0
  const trackTempUnit = raw?.TrackTempCrew?.unit ?? ''
  const airTemp = raw?.AirTemp?.value?.[0] ?? 0
  const airTempUnit = raw?.AirTemp?.unit ?? ''
  const grip = sessionInfo?.Sessions?.[0]?.SessionTrackRubberState ?? ''
  const sessionType = sessionInfo?.Sessions?.[0]?.SessionType ?? ''

  return {
    trackName: weekendInfo?.TrackDisplayName ?? '',
    sessionType: sessionType,
    remainingTimeSecs: sessionTimeRemain,
    lapsRemaining: estimateRaceLapsRemaining(raw, driverInfo),
    airTemp: airTemp,
    airTempUnit: airTempUnit,
    trackTemp: trackTemp,
    trackTempUnit: trackTempUnit,
    grip: grip,
    classes
  }
}

interface StandingsRow {
  carIdx: number
  position: number
  hasLivePosition: boolean
  carNumber: string
  driverName: string
  lapsCompleted: number
  stintLaps: number
  lapDistPct: number
  gapToLeaderSec: number
  bestLapTime: number
  isPlayer: boolean
  classId: number
  className: string
  iRating: number
  licString: string
  licColorHex: string
  classColorHex: string
  avgLapTimeSec: number
  flagIsoCode: string | null
  manufacturerLogoKey: string | null
}

// iRacing's official Strength-of-Field formula
// (publicly documented: https://www.iracing.com/strength-in-numbers/).
// BR1 = 1600/ln(2); SoF = BR1 * ln(n / sum(e^(-iRating_i / BR1))).
// Sanity check: if every driver has the same iRating R, the formula returns
// exactly R (n factors of e^(-R/BR1) cancel against the n in the numerator).
function computeStrengthOfField(iRatings: number[]): number {
  const validRatings = iRatings.filter((r) => r > 0)
  if (validRatings.length === 0) return 0

  const BR1 = 1600 / Math.log(2)
  const sumExp = validRatings.reduce((sum, r) => sum + Math.exp(-r / BR1), 0)
  return Math.round(BR1 * Math.log(validRatings.length / sumExp))
}

// Real race: sort by official position. Session results (ResultsPositions)
// aren't necessarily updated live for every driver.
// If the P1 leaves the server, their stored position "1" can stay frozen
// while live telemetry already shows a new, real P1. On such a collision,
// live position wins. The stale fallback value is discarded and that
// (no longer live) driver is sorted to the end, otherwise two drivers would
// show the same position.
//
// `rows` here is already filtered to a single class (see buildStandings),
// the position values themselves are overall race positions (needed for
// correct sort order/collision resolution across ALL classes), but get
// renumbered 1..N within this class at the end (class P1, not overall position).
function buildRacePositions(rows: StandingsRow[]): DriverStanding[] {
  const takenPositions = new Set(rows.filter((r) => r.hasLivePosition).map((r) => r.position))
  let nextFallbackPosition = rows.reduce((max, r) => Math.max(max, r.position), 0) + 1
  for (const row of rows) {
    if (row.hasLivePosition || row.position === 0) continue
    if (takenPositions.has(row.position)) {
      row.position = nextFallbackPosition++
    } else {
      takenPositions.add(row.position)
    }
  }

  // Position 0 means "not yet classified" (e.g. before first crossing the
  // start/finish line, or DNF).
  // Sort to the end instead of to the front.
  const sorted = [...rows].sort((a, b) => {
    const posA = a.position > 0 ? a.position : Infinity
    const posB = b.position > 0 ? b.position : Infinity
    return posA - posB
  })

  return sorted.map((row, index) => ({
    carIdx: row.carIdx,
    position: index + 1,
    carNumber: row.carNumber,
    driverName: row.driverName,
    lapsCompleted: row.lapsCompleted,
    stintLaps: row.stintLaps,
    gapToLeaderSec: row.gapToLeaderSec,
    bestLapTime: row.bestLapTime,
    isClassFastestLap: false,
    isPlayer: row.isPlayer,
    iRating: row.iRating,
    iRatingChange: null, // filled in by computeRankedClasses() once class order is known
    licString: row.licString,
    licColorHex: row.licColorHex,
    classColorHex: row.classColorHex,
    avgLapTimeSec: row.avgLapTimeSec,
    flagIsoCode: row.flagIsoCode,
    manufacturerLogoKey: row.manufacturerLogoKey
  }))
}

// Practice/Qualifying/Testing: rank = fastest lap time (matching how iRacing
// itself displays it). Stays stable even after a disconnect since
// bestLapTime is already preserved above via the ResultsPositions fallback.
function buildTimeRanking(rows: StandingsRow[]): DriverStanding[] {
  const sorted = [...rows].sort((a, b) => {
    const timeA = a.bestLapTime > 0 ? a.bestLapTime : Infinity
    const timeB = b.bestLapTime > 0 ? b.bestLapTime : Infinity
    return timeA - timeB
  })

  // P1 = fastest time of the session.
  // Outside a race, "gap" is drivers' best time's deficit to this fastest time.
  const fastestTime = sorted[0]?.bestLapTime ?? -1

  return sorted.map((row, index) => ({
    carIdx: row.carIdx,
    position: index + 1,
    carNumber: row.carNumber,
    driverName: row.driverName,
    lapsCompleted: row.lapsCompleted,
    stintLaps: row.stintLaps,
    gapToLeaderSec: fastestTime > 0 && row.bestLapTime > 0 ? row.bestLapTime - fastestTime : 0,
    bestLapTime: row.bestLapTime,
    isClassFastestLap: false,
    isPlayer: row.isPlayer,
    iRating: row.iRating,
    iRatingChange: null, // filled in by computeRankedClasses() once class order is known
    licString: row.licString,
    licColorHex: row.licColorHex,
    classColorHex: row.classColorHex,
    avgLapTimeSec: row.avgLapTimeSec,
    flagIsoCode: row.flagIsoCode,
    manufacturerLogoKey: row.manufacturerLogoKey
  }))
}

// If the player isn't IN this class (driving/watching a different one), show only the top drivers.
// If the player can't be found in ANY class (pure spectator with no discernible focus car),
// leave the list unfiltered.
function filterStandingsWindow(drivers: DriverStanding[], hasPlayerAnywhere: boolean): DriverStanding[] {
  const playerIndex = drivers.findIndex((d) => d.isPlayer)
  // Without a focused player at all, don't trim any class
  if (playerIndex === -1) return hasPlayerAnywhere ? drivers.slice(0, standingsTopCount) : drivers

  const visible = new Set<number>()
  for (let i = 0; i < Math.min(drivers.length, standingsTopCount); i++) visible.add(i)

  const windowStart = Math.max(0, playerIndex - standingsAhead)
  const windowEnd = Math.min(drivers.length, playerIndex + standingsBehind + 1)
  for (let i = windowStart; i < windowEnd; i++) visible.add(i)

  return Array.from(visible)
    .sort((a, b) => a - b)
    .map((i) => drivers[i])
}

// Gap to the player is computed ourselves instead of from CarIdxF2Time,
// this way the Relative overlay updates continuously in any session type instead of only
// once per lap: track position (completed laps + CarIdxEstTime for
// current lap) is converted into a time equivalent and compared to player.
function buildRelative(raw: TelemetryVarList): RelativeData {
  const driverInfo = sdk.getDriverInfo()
  const rawPlayerCarIdx = raw.PlayerCarIdx?.value?.[0] ?? -1
  const playerCarIdx = resolveFocusCarIdx(raw, rawPlayerCarIdx)

  const laps = raw.CarIdxLapCompleted?.value ?? []
  const lapDistPct = raw.CarIdxLapDistPct?.value ?? []
  const trackSurface = raw.CarIdxTrackSurface?.value ?? []
  const classPositions = computeClassPositions(raw)

  // driverInfo.Drivers doesn't reliably mark a driver as a spectator after
  // they leave the server, they can stay listed with frozen lap data.
  // CarIdxTrackSurface === -1 (NotInWorld) is reliable and used in
  // addition to IsSpectator/CarIsPaceCar for filtering,
  // otherwise disconnected drivers would stay visible.
  const rows = (driverInfo?.Drivers ?? [])
    .filter((driver) => !driver.IsSpectator && !driver.CarIsPaceCar && (trackSurface[driver.CarIdx] ?? -1) !== -1)
    .map((driver) => {
      const carIdx = driver.CarIdx
      const classPosition = classPositions.get(carIdx)
      return {
        carIdx,
        position: classPosition?.position ?? 0,
        carNumber: driver.CarNumber,
        driverName: displayDriverName(carIdx, rawPlayerCarIdx, driver.TeamName),
        lap: laps[carIdx] ?? 0,
        stintLaps: stintLaps(carIdx, laps[carIdx] ?? 0),
        lapDistPct: lapDistPct[carIdx] ?? 0,
        estLapTime: driver.CarClassEstLapTime > 0 ? driver.CarClassEstLapTime : 0,
        // Named "isFocused" (not "isPlayer") because playerCarIdx above is
        // actually resolveFocusCarIdx(), while spectating this is the
        // watched car (CamCarIdx), not necessarily our own. Mapped back to
        // the public "isPlayer" field name below (RelativeDriver.isPlayer),
        // which the frontend uses regardless of which car it refers to.
        isFocused: carIdx === playerCarIdx,
        iRating: driver.IRating,
        iRatingChange: classPosition?.iRatingChange ?? null,
        licString: driver.LicString ?? '',
        licColorHex: sdkColorHex(driver.LicColor),
        classColorHex: sdkColorHex(driver.CarClassColor),
        avgLapTimeSec: avgLapTimeSec(driver.UserID)
      }
    })

  const focusDriver = rows.find((row) => row.isFocused)
  if (!focusDriver) {
    return { drivers: [] }
  }

  // Using track distance from car in focus to other cars to calculate gap time.
  // Always picking shorter distance (max value = half a lap distance)
  // todo, find a way to compensate for braking in corners
  //  (e.g. when car1 brakes and car2 behind is still on straight
  //  it gets 'closer' but in reality, because car2 will also brake at
  //  the corner, the gap stays the same)
  const withGap = rows.map((row) => {
    let pctDiff = row.lapDistPct - focusDriver.lapDistPct
    if (pctDiff > 0.5) pctDiff -= 1
    if (pctDiff < -0.5) pctDiff += 1

    const lapTimeEstimate = focusDriver.estLapTime || row.estLapTime || 0

    return {
      ...row,
      // + = behind, - = ahead
      gapToPlayerSec: -pctDiff * lapTimeEstimate
    }
  })

  // Sort by gap time (not track distance and ignoring lap count),
  // so drivers with a negative time (ahead) end up on top and positive time (behind)
  // at the bottom, like iRacing's own Relative box.
  withGap.sort((a, b) => a.gapToPlayerSec - b.gapToPlayerSec)

  const focusIndex = withGap.findIndex((row) => row.isFocused)
  const start = Math.max(0, focusIndex - relativeAhead)
  const end = Math.min(withGap.length, focusIndex + relativeBehind + 1)

  const drivers: RelativeDriver[] = withGap.slice(start, end).map((row) => ({
    carIdx: row.carIdx,
    position: row.position,
    carNumber: row.carNumber,
    driverName: row.driverName,
    lap: row.lap,
    stintLaps: row.stintLaps,
    gapToPlayerSec: row.gapToPlayerSec,
    lapsDifference: row.lap - focusDriver.lap,
    isPlayer: row.isFocused,
    iRating: row.iRating,
    iRatingChange: row.iRatingChange,
    licString: row.licString,
    licColorHex: row.licColorHex,
    classColorHex: row.classColorHex,
    avgLapTimeSec: row.avgLapTimeSec
  }))

  return { drivers }
}

// Maps irsdk_TrkLoc (see @irsdk-node/types defines.d.ts) to internal states.
function trackSurfaceStatus(raw: number): TrackSurfaceStatus | null {
  switch (raw) {
    case 0:
      return 'off-track'
    case 1:
      return 'in-pit-stall'
    case 2:
      return 'approaching-pits'
    case 3:
      return 'on-track'
    default:
      return null
  }
}

// Places car marker on track based on lapDistPct (0..1) on the SVGs provided.
// Also adds CarIdxTrackSurface for on-track/pit-lane/off-track status.
function buildTrackMap(raw: TelemetryVarList): TrackMapData {
  const driverInfo = sdk.getDriverInfo()
  const weekendInfo = sdk.getWeekendInfo()
  const rawPlayerCarIdx = raw.PlayerCarIdx?.value?.[0] ?? -1
  const playerCarIdx = resolveFocusCarIdx(raw, rawPlayerCarIdx)

  const lapDistPct = raw.CarIdxLapDistPct?.value ?? []
  const trackSurface = raw.CarIdxTrackSurface?.value ?? []

  const drivers: TrackMapDriver[] = []
  for (const driver of driverInfo?.Drivers ?? []) {
    if (driver.IsSpectator || driver.CarIsPaceCar) continue

    const carIdx = driver.CarIdx
    const surface = trackSurfaceStatus(trackSurface[carIdx] ?? -1)
    if (!surface) continue

    drivers.push({
      carIdx,
      carNumber: driver.CarNumber,
      driverName: displayDriverName(carIdx, rawPlayerCarIdx, driver.UserName),
      classColorHex: sdkColorHex(driver.CarClassColor),
      lapDistPct: lapDistPct[carIdx] ?? 0,
      surface,
      isPlayer: carIdx === playerCarIdx
    })
  }

  return {
    trackId: weekendInfo?.TrackID ?? -1,
    trackName: weekendInfo?.TrackDisplayName ?? '',
    drivers
  }
}

function buildFlags(raw: TelemetryVarList): FlagsData {
  return { flags: raw.SessionFlags?.value?.[0] ?? 0 }
}

loop()
