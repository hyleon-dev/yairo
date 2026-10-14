import { manufacturerLogoKey } from '../../manufacturerLogos'
import { estimateIratingChanges } from '../../iratingCalculator'
import type { DriverStanding, StandingsClass, StandingsData } from '../../../shared/types'
import type { SimSnapshot } from '../snapshot'
import { displayDriverName } from './driverNames'
import { estimateRaceLapsRemaining } from './fuel'
import { avgLapTimeSec, stintLaps } from './tracking'

export interface StandingsWindow {
  ahead: number
  behind: number
  topCount: number
}

export function isRaceSession(snap: SimSnapshot): boolean {
  return snap.session.sessionType.toLowerCase().includes('race')
}

interface RankedStandingsClass {
  classId: number
  className: string
  driverCount: number
  strengthOfField: number
  drivers: DriverStanding[]
}

interface StandingsRow {
  carIdx: number
  position: number
  hasLivePosition: boolean
  carNumber: string
  displayName: string
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
  lastLapTime: number
}

function computeRankedClasses(snap: SimSnapshot): RankedStandingsClass[] {
  const rows: StandingsRow[] = snap.cars.map((car) => {
    const official = car.official
    const hasLivePosition = car.position > 0
    const position = hasLivePosition ? car.position : (official?.position ?? 0)
    const lapsCompleted = car.lapsCompleted > 0 ? car.lapsCompleted : (official?.lapsCompleted ?? car.lapsCompleted)
    const bestLapTime = car.bestLapTime > 0 ? car.bestLapTime : (official?.bestLapTime ?? car.bestLapTime)
    const lastLapTime = car.lastLapTime > 0 ? car.lastLapTime : (official?.lastLapTime ?? car.lastLapTime)

    return {
      carIdx: car.carIdx,
      position,
      hasLivePosition,
      carNumber: car.carNumber,
      displayName: displayDriverName(
        car.carIdx,
        snap.ownCarIdx,
        car.teamName || car.driverName || `Driver #${car.carIdx}`
      ),
      lapsCompleted,
      stintLaps: stintLaps(car.carIdx, lapsCompleted),
      lapDistPct: car.lapDistPct,
      gapToLeaderSec: car.gapToLeaderSec,
      bestLapTime,
      isPlayer: car.carIdx === snap.focusCarIdx,
      classId: car.classId,
      className: car.className,
      iRating: car.iRating,
      licString: car.licString,
      licColorHex: car.licColorHex,
      classColorHex: car.classColorHex,
      avgLapTimeSec: avgLapTimeSec(car.driverId),
      flagIsoCode: car.flagIsoCode,
      manufacturerLogoKey: manufacturerLogoKey(car.carName),
      lastLapTime
    }
  })

  const isRace = isRaceSession(snap)

  // Position, gap, and ranking order must all be computed per class for multiclass races.
  const rowsByClass = new Map<number, StandingsRow[]>()
  for (const row of rows) {
    const list = rowsByClass.get(row.classId)
    if (list) list.push(row)
    else rowsByClass.set(row.classId, [row])
  }

  return Array.from(rowsByClass.entries()).map(([classId, classRows]) => {
    const drivers = isRace ? buildRacePositions(classRows) : buildTimeRanking(classRows)

    // Fastest valid best-lap time WITHIN this class
    const classFastestLapTime = Math.min(...drivers.map((d) => d.bestLapTime).filter((t) => t > 0))

    // iRating changes only apply to actual races. Drivers are already in
    // class-position order (index 0 = P1) here, matching what
    // estimateIratingChanges() expects.
    const iRatingChanges = isRace
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

export interface ClassPositionInfo {
  position: number
  iRatingChange: number | null
}

// Position + iRating-change estimate per car, both derived from the same
// per-class ranking (see computeRankedClasses()).
export function computeClassPositions(snap: SimSnapshot): Map<number, ClassPositionInfo> {
  const infoByCarIdx = new Map<number, ClassPositionInfo>()
  for (const cls of computeRankedClasses(snap)) {
    for (const driver of cls.drivers) {
      infoByCarIdx.set(driver.carIdx, { position: driver.position, iRatingChange: driver.iRatingChange })
    }
  }
  return infoByCarIdx
}

export function buildStandings(snap: SimSnapshot, window: StandingsWindow): StandingsData {
  const { session } = snap
  const rankedClasses = computeRankedClasses(snap)
  const hasPlayerAnywhere = rankedClasses.some((cls) => cls.drivers.some((d) => d.isPlayer))

  const classes: StandingsClass[] = rankedClasses
    .map((cls) => ({ ...cls, drivers: filterStandingsWindow(cls.drivers, hasPlayerAnywhere, window) }))
    // Strongest (fastest) class first, matching iRacing's own multiclass results ordering.
    .sort((a, b) => b.strengthOfField - a.strengthOfField)

  return {
    trackName: session.trackName,
    sessionType: session.sessionType,
    remainingTimeSecs: session.timeRemainSec ?? 0,
    lapsRemaining: estimateRaceLapsRemaining(snap),
    airTemp: session.airTemp,
    airTempUnit: session.airTempUnit,
    trackTemp: session.trackTemp,
    trackTempUnit: session.trackTempUnit,
    grip: session.grip,
    classes
  }
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

// Real race: sort by official position. Session results (official)
// aren't necessarily updated live for every driver.
// If the P1 leaves the server, their stored position "1" can stay frozen
// while live telemetry already shows a new, real P1. On such a collision,
// live position wins. The stale fallback value is discarded and that
// (no longer live) driver is sorted to the end, otherwise two drivers would
// show the same position.
//
// `rows` here is already filtered to a single class (see buildStandings).
// The position values themselves are overall race positions. This is needed
// for correct sort order and collision resolution across ALL classes.
// They get renumbered 1..N within this class at the end (class P1, not overall position).
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
    if (posA !== posB) return posA - posB

    // Both unclassified, e.g. during the formation lap before anyone has
    // crossed start/finish yet.
    // Fall back to current track distance, so the order still reflects the
    // actual running order. Otherwise it would use Array.sort's stable
    // fallback (insertion order, effectively car number order).
    const distA = a.lapsCompleted + a.lapDistPct
    const distB = b.lapsCompleted + b.lapDistPct
    return distB - distA
  })

  // Track progress (completed laps + current lap's distance), not just completed
  // lap count. Using completed laps alone would flag a driver as lapped as soon
  // as the leader crosses start/finish again, even if the driver is only a few
  // seconds behind and about to complete that same lap themselves.
  const leader = sorted[0]
  const leaderProgress = (leader?.lapsCompleted ?? 0) + (leader?.lapDistPct ?? 0)

  return sorted.map((row, index) => ({
    carIdx: row.carIdx,
    position: index + 1,
    carNumber: row.carNumber,
    driverName: row.displayName,
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
    manufacturerLogoKey: row.manufacturerLogoKey,
    lastLapTime: row.lastLapTime,
    lapsDown: Math.max(0, Math.floor(leaderProgress - (row.lapsCompleted + row.lapDistPct)))
  }))
}

// Practice/Qualifying/Testing: rank = fastest lap time (matching how iRacing
// itself displays it).
// Stays stable even after a disconnect, because bestLapTime is already
// preserved above via the official results fallback.
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
    driverName: row.displayName,
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
    manufacturerLogoKey: row.manufacturerLogoKey,
    lastLapTime: row.lastLapTime,
    lapsDown: 0 // "laps down" only applies to races, not time-ranked sessions
  }))
}

// If the player isn't IN this class (driving/watching a different one), show only the top drivers.
// If the player can't be found in ANY class (pure spectator with no discernible focus car),
// leave the list unfiltered.
function filterStandingsWindow(
  drivers: DriverStanding[],
  hasPlayerAnywhere: boolean,
  window: StandingsWindow
): DriverStanding[] {
  const playerIndex = drivers.findIndex((d) => d.isPlayer)
  // Without a focused player at all, don't trim any class
  if (playerIndex === -1) return hasPlayerAnywhere ? drivers.slice(0, window.topCount) : drivers

  const visible = new Set<number>()
  for (let i = 0; i < Math.min(drivers.length, window.topCount); i++) visible.add(i)

  const windowStart = Math.max(0, playerIndex - window.ahead)
  const windowEnd = Math.min(drivers.length, playerIndex + window.behind + 1)
  for (let i = windowStart; i < windowEnd; i++) visible.add(i)

  return Array.from(visible)
    .sort((a, b) => a - b)
    .map((i) => drivers[i])
}
