import type { RelativeData, RelativeDriver } from '../../../shared/types'
import type { SimSnapshot } from '../snapshot'
import { displayDriverName } from './driverNames'
import { computeClassPositions, isRaceSession } from './standings'
import { avgLapTimeSec, stintLaps } from './tracking'

export interface RelativeWindow {
  ahead: number
  behind: number
}

// Right after either car crosses start/finish, the completed lap counts can differ
// by 1, even though both cars are still essentially side by side on track.
// This is an artifact of one car crossing the line a moment before the other.
// It is not a genuine full-lap gap.
// That ambiguity only exists right at the line. So a one-lap difference
// elsewhere on track is always trusted (e.g. a car that was just lapped and
// is now trailing right behind, which can happen anywhere).
// Checking the gap's sign instead of line proximity does not work here. A
// lapped car can end up on either side of the focus car, depending on
// whether it is about to be lapped or was just lapped a moment ago.
const LAP_LINE_PROXIMITY_PCT = 0.02

function resolveLapsDifference(rawDiff: number, focusLapDistPct: number, rowLapDistPct: number): number {
  if (Math.abs(rawDiff) !== 1) return rawDiff
  const nearLine = (pct: number): boolean => pct < LAP_LINE_PROXIMITY_PCT || pct > 1 - LAP_LINE_PROXIMITY_PCT
  return nearLine(focusLapDistPct) || nearLine(rowLapDistPct) ? 0 : rawDiff
}

// Gap to the player is computed ourselves instead of from the sim's gap values.
// This way the Relative overlay updates continuously in any session type,
// instead of only once per lap.
export function buildRelative(snap: SimSnapshot, window: RelativeWindow): RelativeData {
  const isRace = isRaceSession(snap)
  const classPositions = computeClassPositions(snap)

  // Disconnected drivers can stay listed in the roster with frozen lap data.
  // Not being in the world (surface null) is reliable and filters them out.
  const rows = snap.cars
    .filter((car) => car.isLive && car.surface !== null)
    .map((car) => {
      const classPosition = classPositions.get(car.carIdx)
      return {
        carIdx: car.carIdx,
        position: classPosition?.position ?? 0,
        carNumber: car.carNumber,
        driverName: displayDriverName(car.carIdx, snap.ownCarIdx, car.driverName),
        lap: car.lapsCompleted,
        stintLaps: stintLaps(car.carIdx, car.lapsCompleted),
        lapDistPct: car.lapDistPct,
        estLapTime: car.classEstLapTime > 0 ? car.classEstLapTime : 0,
        isInPit: car.surface === 'in-pit-stall' || car.surface === 'approaching-pits',
        // Named "isFocused" (not "isPlayer") because focusCarIdx is, while
        // spectating, the watched car, not necessarily our own.
        // Mapped back to the public "isPlayer" field name below
        // (RelativeDriver.isPlayer). The frontend uses that name regardless
        // of which car it refers to.
        isFocused: car.carIdx === snap.focusCarIdx,
        iRating: car.iRating,
        iRatingChange: classPosition?.iRatingChange ?? null,
        licString: car.licString,
        licColorHex: car.licColorHex,
        classColorHex: car.classColorHex,
        avgLapTimeSec: avgLapTimeSec(car.driverId),
        lastLapTime: car.lastLapTime
      }
    })

  const focusDriver = rows.find((row) => row.isFocused)
  if (!focusDriver) {
    return { sim: snap.sim, drivers: [] }
  }

  // Using track distance from the car in focus to other cars, to calculate gap time.
  // Always picks the shorter distance (max value = half a lap distance).
  // todo: find a way to compensate for braking in corners.
  //  (e.g. when car1 brakes and car2 behind is still on the straight, it
  //  gets 'closer'. But in reality the gap stays the same, because car2
  //  will also brake at the corner.)
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

  // Sort by gap time, not track distance, and ignore lap count.
  // Drivers with a negative time (ahead) end up on top, positive time
  // (behind) at the bottom. This matches iRacing's own Relative box.
  withGap.sort((a, b) => a.gapToPlayerSec - b.gapToPlayerSec)

  const focusIndex = withGap.findIndex((row) => row.isFocused)
  const start = Math.max(0, focusIndex - window.ahead)
  const end = Math.min(withGap.length, focusIndex + window.behind + 1)

  const drivers: RelativeDriver[] = withGap.slice(start, end).map((row) => ({
    carIdx: row.carIdx,
    position: row.position,
    carNumber: row.carNumber,
    driverName: row.driverName,
    lap: row.lap,
    stintLaps: row.stintLaps,
    gapToPlayerSec: row.gapToPlayerSec,
    // Laps aren't synchronized to a race distance in practice/qualifying (drivers pit
    // whenever), so a lap difference there doesn't mean "lapped" like it does in a race.
    lapsDifference: isRace
      ? resolveLapsDifference(row.lap - focusDriver.lap, focusDriver.lapDistPct, row.lapDistPct)
      : 0,
    isPlayer: row.isFocused,
    isInPit: row.isInPit,
    iRating: row.iRating,
    iRatingChange: row.iRatingChange,
    licString: row.licString,
    licColorHex: row.licColorHex,
    classColorHex: row.classColorHex,
    avgLapTimeSec: row.avgLapTimeSec,
    lastLapTime: row.lastLapTime
  }))

  return { sim: snap.sim, drivers }
}
