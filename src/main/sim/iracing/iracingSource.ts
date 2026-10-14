import {
  IRacingSDK,
  type DriverInfo,
  type SessionInfo,
  type SessionList,
  type SessionResultsPosition,
  type TelemetryVarList,
  type WeekendInfo
} from 'irsdk-node'
import { FakeIRacingSDK } from './irsdkFake'
import { flairNameToIsoCode } from '../../nationFlags'
import type { TireWheelData, TiresData, TrackSurfaceStatus } from '../../../shared/types'
import type { SimCar, SimPlayerCar, SimSession, SimSnapshot, SimSource } from '../snapshot'

export interface IrsdkLike {
  startSDK(): boolean
  stopSDK?(): void
  waitForData(timeoutMs?: number): boolean
  getTelemetry(): TelemetryVarList
  getDriverInfo(): DriverInfo | null
  getWeekendInfo(): WeekendInfo | null
  getSessionInfo(): SessionList | null
}

export function createIrsdk(): IrsdkLike {
  if (process.env.IRSDK_MOCK === '1') {
    console.log('[iracing] IRSDK_MOCK=1 - using FakeIRacingSDK instead of the real iRacing connection')
    return new FakeIRacingSDK()
  }
  return new IRacingSDK({ autoEnableTelemetry: true })
}

export class IracingSource implements SimSource {
  readonly name = 'iracing'

  constructor(private readonly sdk: IrsdkLike = createIrsdk()) {
    sdk.startSDK()
  }

  attach(): void {
    this.sdk.startSDK()
  }

  waitForFrame(timeoutMs: number): boolean {
    return this.sdk.waitForData(timeoutMs)
  }

  close(): void {
    this.sdk.stopSDK?.()
  }

  read(): SimSnapshot | null {
    const raw = this.sdk.getTelemetry()
    if (!raw) return null

    const driverInfo = this.sdk.getDriverInfo()
    const weekendInfo = this.sdk.getWeekendInfo()
    const sessionInfo = this.sdk.getSessionInfo()

    const ownCarIdx = raw.PlayerCarIdx?.value?.[0] ?? -1
    const isDriving = raw.IsOnTrack?.value?.[0] ?? false

    return {
      session: buildSession(raw, driverInfo, weekendInfo, sessionInfo),
      ownCarIdx,
      focusCarIdx: resolveFocusCarIdx(raw, ownCarIdx),
      isDriving,
      player: isDriving ? buildPlayerCar(raw, driverInfo) : null,
      cars: buildCars(raw, driverInfo, sessionInfo, ownCarIdx)
    }
  }
}

// When not actively driving our own car, Standings and Relative should focus
// on the car the camera is following (CamCarIdx).
// While driving, focus always stays on our own car.
function resolveFocusCarIdx(raw: TelemetryVarList, rawPlayerCarIdx: number): number {
  const isDriving = raw.IsOnTrack?.value?.[0] ?? false
  if (isDriving) return rawPlayerCarIdx

  const camCarIdx = raw.CamCarIdx?.value?.[0] ?? -1
  return camCarIdx >= 0 ? camCarIdx : rawPlayerCarIdx
}

function currentSession(raw: TelemetryVarList, sessionInfo: SessionList | null): SessionInfo | undefined {
  const currentSessionNum = raw.SessionNum?.value?.[0] ?? 0
  return sessionInfo?.Sessions?.find((s) => s.SessionNum === currentSessionNum)
}

function buildSession(
  raw: TelemetryVarList,
  driverInfo: DriverInfo | null,
  weekendInfo: WeekendInfo | null,
  sessionInfo: SessionList | null
): SimSession {
  const sessionNum = raw.SessionNum?.value?.[0] ?? 0
  // Despite the declared string type, the YAML parser underneath can hand back
  // a plain number here (e.g. a bare 17 instead of "17x").
  // This broke fmtLimit()'s string methods in IncidentsOverlay.tsx. Coerced
  // explicitly here rather than trusting the SDK type.
  const rawIncidentLimit = weekendInfo?.WeekendOptions?.IncidentLimit

  return {
    sessionNum,
    sessionType: currentSession(raw, sessionInfo)?.SessionType ?? '',
    trackId: weekendInfo?.TrackID ?? -1,
    trackName: weekendInfo?.TrackDisplayName ?? '',
    trackLengthM: trackLengthMeters(weekendInfo),
    sessionTimeSec: raw.SessionTime?.value?.[0] ?? 0,
    timeRemainSec: raw.SessionTimeRemain?.value?.[0] ?? null,
    lapsRemain: raw.SessionLapsRemainEx?.value?.[0] ?? null,
    airTemp: raw.AirTemp?.value?.[0] ?? 0,
    airTempUnit: raw.AirTemp?.unit ?? '',
    trackTemp: raw.TrackTempCrew?.value?.[0] ?? 0,
    trackTempUnit: raw.TrackTempCrew?.unit ?? '',
    grip: resolveGripState(sessionInfo?.Sessions, sessionNum),
    flags: raw.SessionFlags?.value?.[0] ?? 0,
    currentDriverIncidentCount: raw.PlayerCarDriverIncidentCount?.value?.[0] ?? -1,
    teamIncidentCount: raw.PlayerCarTeamIncidentCount?.value?.[0] ?? -1,
    incidentLimit: rawIncidentLimit != null ? String(rawIncidentLimit) : '',
    leaderCarIdx: raw.CarIdxPosition?.value?.findIndex((p) => p === 1) ?? -1
  }
}

// irsdk_EngineWarnings bit for "pit speed limiter engaged"
const ENGINE_WARNING_PIT_SPEED_LIMITER = 16

function buildPlayerCar(raw: TelemetryVarList, driver: DriverInfo | null): SimPlayerCar {
  const engineWarnings = raw.EngineWarnings?.value?.[0] ?? 0

  // DriverCarMaxFuelPct despite its "%" unit label is a 0..1 fraction (like
  // FuelLevelPct, see irsdkFake.ts). 0 means the event doesn't restrict fuel
  // load below the car's physical tank size.
  const tankMaxL = driver?.DriverCarFuelMaxLtr ?? 0
  const maxFuelPct = driver?.DriverCarMaxFuelPct ?? 0

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
    fuelLevelL: raw.FuelLevel?.value?.[0] ?? 0,
    fuelLevelPct: raw.FuelLevelPct?.value?.[0] ?? 1,
    fuelCapacityL: maxFuelPct > 0 ? tankMaxL * maxFuelPct : tankMaxL,
    // Own car only. Straight passthrough of iRacing's own pit service menu value.
    // Live-tracks "Auto Fill" if the driver enabled it there. Otherwise
    // whatever amount is currently dialed in manually.
    nextPitFuelL: raw.PitSvFuel?.value?.[0] ?? null,
    lap: raw.Lap?.value?.[0] ?? 0,
    lapDistPct: raw.LapDistPct?.value?.[0] ?? 0,
    lapCurrentTime: raw.LapCurrentLapTime?.value?.[0] ?? -1,
    lapLastTime: raw.LapLastLapTime?.value?.[0] ?? -1,
    lapBestTime: raw.LapBestLapTime?.value?.[0] ?? -1,
    lapDeltaToBest: raw.LapDeltaToBestLap?.value?.[0] ?? 0,
    lapDeltaToBestValid: raw.LapDeltaToBestLap_OK?.value?.[0] ?? false,
    isOnPitRoad: raw.OnPitRoad?.value?.[0] ?? false,
    pitLimiterActive: (engineWarnings & ENGINE_WARNING_PIT_SPEED_LIMITER) !== 0,
    incidentCount: raw.PlayerCarMyIncidentCount?.value?.[0] ?? 0,
    tires: buildTires(raw)
  }
}

function buildCars(
  raw: TelemetryVarList,
  driverInfo: DriverInfo | null,
  sessionInfo: SessionList | null,
  ownCarIdx: number
): SimCar[] {
  const positions = raw.CarIdxPosition?.value ?? []
  const laps = raw.CarIdxLap?.value ?? []
  const lapsCompleted = raw.CarIdxLapCompleted?.value ?? []
  const lapDistPct = raw.CarIdxLapDistPct?.value ?? []
  const trackSurface = raw.CarIdxTrackSurface?.value ?? []
  // TODO SDK doc only says "race time behind leader". Not verified whether
  //  this is scoped to the car's own class or the overall race leader in a
  //  multiclass session.
  const gapToLeader = raw.CarIdxF2Time?.value ?? []
  const bestLapTimes = raw.CarIdxBestLapTime?.value ?? []
  const lastLapTimes = raw.CarIdxLastLapTime?.value ?? []
  const estTimes = raw.CarIdxEstTime?.value ?? []
  const rpms = raw.CarIdxRPM?.value ?? []
  const gears = raw.CarIdxGear?.value ?? []
  const playerCarPosition = raw.PlayerCarPosition?.value?.[0] ?? 0

  // Official session results stays for a driver once they've
  // set a valid time, even after they've left the server
  const resultsByCarIdx = new Map<number, SessionResultsPosition>(
    (currentSession(raw, sessionInfo)?.ResultsPositions ?? []).map((r) => [r.CarIdx, r])
  )

  const driverByCarIdx = new Map((driverInfo?.Drivers ?? []).map((d) => [d.CarIdx, d]))

  // Roster = all currently connected drivers (excluding spectators/pace car),
  // UNION all CarIdx from the session results.
  // This adds back drivers missing from the live roster (e.g. IsSpectator),
  // with less data available for them.
  const liveCarIdxs = new Set<number>()
  for (const driver of driverInfo?.Drivers ?? []) {
    if (!driver.IsSpectator && !driver.CarIsPaceCar) liveCarIdxs.add(driver.CarIdx)
  }
  const carIdxs = new Set(liveCarIdxs)
  for (const carIdx of resultsByCarIdx.keys()) carIdxs.add(carIdx)

  return Array.from(carIdxs).map((carIdx) => {
    const driver = driverByCarIdx.get(carIdx)
    const result = resultsByCarIdx.get(carIdx)
    // "PlayerCarPosition" always refers to own car
    const position = carIdx === ownCarIdx && playerCarPosition > 0 ? playerCarPosition : (positions[carIdx] ?? 0)

    return {
      carIdx,
      isLive: liveCarIdxs.has(carIdx),
      surface: trackSurfaceStatus(trackSurface[carIdx] ?? -1),
      driverId: driver?.UserID,
      driverName: driver?.UserName ?? '',
      // TeamName mirrors UserName in non-team sessions, so this also covers solo events.
      teamName: driver?.TeamName ?? '',
      carNumber: driver?.CarNumber ?? '?',
      carId: driver?.CarID ?? -1,
      carName: driver?.CarScreenName ?? '',
      classId: driver?.CarClassID ?? 0,
      className: driver?.CarClassShortName ?? '?',
      classColorHex: sdkColorHex(driver?.CarClassColor),
      classEstLapTime: driver?.CarClassEstLapTime ?? -1,
      iRating: driver?.IRating ?? 0,
      licString: driver?.LicString ?? '',
      licColorHex: licenseColorHex(driver?.LicString),
      flagIsoCode: flairNameToIsoCode((driver as { FlairName?: string } | undefined)?.FlairName),
      // iRacing reports CurDriverIncidentCount as -1 for other drivers. Pass -1
      // through rather than normalizing to 0.
      // This lets the UI tell "unavailable" apart from "0 incidents".
      incidentCount: driver?.CurDriverIncidentCount ?? -1,
      position,
      lap: laps[carIdx] ?? 0,
      lapsCompleted: lapsCompleted[carIdx] ?? 0,
      lapDistPct: lapDistPct[carIdx] ?? 0,
      gapToLeaderSec: gapToLeader[carIdx] ?? 0,
      bestLapTime: bestLapTimes[carIdx] ?? -1,
      lastLapTime: lastLapTimes[carIdx] ?? -1,
      // No exact "current lap time" available per vehicle. Time since the
      // last start/finish crossing is the closest approximation.
      currentLapTime: estTimes[carIdx] ?? -1,
      rpm: rpms[carIdx] ?? 0,
      gear: gears[carIdx] ?? 0,
      official: result
        ? {
            position: result.Position,
            lapsCompleted: result.LapsComplete,
            bestLapTime: result.FastestTime,
            lastLapTime: result.LastTime
          }
        : undefined
    }
  })
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

// e.g. Driver.CarClassColor
function sdkColorHex(raw: number | undefined): string {
  return '#' + ((raw ?? 0) & 0xffffff).toString(16).padStart(6, '0')
}

// Official iRacing license class colors, keyed by LicString's first letter (e.g. "A 4.99" -> "A").
// Driver.LicColor from the SDK is not used for this. Seen live: an "A"-license
// driver reported green (the actual B color) instead of blue.
// No consistent pattern found, other "A" drivers in the same session had the correct color.
const LICENSE_COLORS: Record<string, string> = {
  R: '#E1251B',
  D: '#FF6600',
  C: '#FFCC00',
  B: '#33CC00',
  A: '#006EFF',
  P: '#7C00FF'
}

function licenseColorHex(licString: string | undefined): string {
  const letter = (licString ?? '').trim().charAt(0).toUpperCase()
  return LICENSE_COLORS[letter] ?? '#828287'
}

// "Carry Over" as a session's SessionTrackRubberState just means "same as the
// previous session ended at", not an actual grip level. Walks backwards
// through the weekend's sessions (Practice/Qualify/Race, ...) until a concrete
// (non carry-over) state is found.
function resolveGripState(sessions: SessionInfo[] | undefined, sessionNum: number): string {
  const bySessionNum = new Map((sessions ?? []).map((s) => [s.SessionNum, s]))
  for (let num = sessionNum; num >= 0; num--) {
    const state = bySessionNum.get(num)?.SessionTrackRubberState ?? ''
    if (state.trim().toLowerCase() !== 'carry over') return state
  }
  return ''
}

function trackLengthMeters(weekendInfo: WeekendInfo | null): number {
  const match = (weekendInfo?.TrackLength ?? '').match(/([\d.]+)\s*(km|mi)/i)
  if (!match) return 0
  const value = parseFloat(match[1])
  return match[2].toLowerCase() === 'mi' ? value * 1609.344 : value * 1000
}
