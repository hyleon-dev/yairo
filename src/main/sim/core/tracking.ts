import type { DriverLapCompletedEvent } from '../../../shared/types'
import type { SimSnapshot } from '../snapshot'

const lastLapsCompletedByCarIdx = new Map<number, number>()

// Sum/count of every lap time recorded this session, keyed by driverId.
const lapTimeStatsByDriverId = new Map<number, { sum: number; count: number }>()
let lastLapStatsSessionNum: number | null = null

export function checkLapCompletions(snap: SimSnapshot): DriverLapCompletedEvent[] {
  const { sessionNum, sessionType, trackId, trackName } = snap.session

  // Average lap time is scoped to the current session only. For example,
  // switching from Qualify to Race must not carry qualifying laps into the race average.
  if (lastLapStatsSessionNum !== null && sessionNum !== lastLapStatsSessionNum) {
    lapTimeStatsByDriverId.clear()
  }
  lastLapStatsSessionNum = sessionNum

  const events: DriverLapCompletedEvent[] = []

  for (const car of snap.cars) {
    if (!car.isLive) continue

    const current = car.lapsCompleted
    const previous = lastLapsCompletedByCarIdx.get(car.carIdx)

    if (previous !== undefined && current > previous && car.driverId !== undefined) {
      const lapTimeSec = car.lastLapTime
      if (lapTimeSec > 0) {
        const stats = lapTimeStatsByDriverId.get(car.driverId) ?? { sum: 0, count: 0 }
        stats.sum += lapTimeSec
        stats.count += 1
        lapTimeStatsByDriverId.set(car.driverId, stats)

        events.push({
          custId: car.driverId,
          driverName: car.driverName,
          entry: {
            lapTimeSec,
            trackId,
            trackName,
            carId: car.carId,
            carName: car.carName,
            sessionType,
            recordedAt: Date.now()
          }
        })
      }
    }

    lastLapsCompletedByCarIdx.set(car.carIdx, current)
  }

  return events
}

// -1 = no lap recorded yet for this driver this session (or no driver at all).
export function avgLapTimeSec(driverId: number | undefined): number {
  if (driverId === undefined) return -1
  const stats = lapTimeStatsByDriverId.get(driverId)
  if (!stats || stats.count === 0) return -1
  return stats.sum / stats.count
}

// Tracks the completed-lap count from when a car enters the pits. Stays
// frozen after leaving pits and marks the start of the current stint.
// No entry this session means the stint counts from session start.
const lastPitLapByCarIdx = new Map<number, number>()
let lastStintSessionNum: number | null = null

export function updateStintTracking(snap: SimSnapshot): void {
  const { sessionNum } = snap.session

  // reset on new session
  if (lastStintSessionNum !== null && sessionNum !== lastStintSessionNum) {
    lastPitLapByCarIdx.clear()
  }
  lastStintSessionNum = sessionNum

  for (const car of snap.cars) {
    if (car.isLive && car.surface === 'in-pit-stall') {
      lastPitLapByCarIdx.set(car.carIdx, car.lapsCompleted)
    }
  }
}

export function stintLaps(carIdx: number, lapsCompleted: number): number {
  return Math.max(0, lapsCompleted - (lastPitLapByCarIdx.get(carIdx) ?? 0))
}
