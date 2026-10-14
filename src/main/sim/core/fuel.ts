import type { FuelEstimate, FuelLapEstimate } from '../../../shared/types'
import type { SimPlayerCar, SimSnapshot } from '../snapshot'

// Sims provide neither consumption-per-lap nor a range estimate, only own-car fuel level.
// Computed here by comparing the fuel level at the start of each lap to get that lap's consumption.
const FUEL_HISTORY_SIZE = 5 // for the "average of the last 5 laps" value
let lastFuelLapSample: { lap: number; fuelLevel: number } | null = null
let fuelPerLapHistory: number[] = [] // oldest first, at most FUEL_HISTORY_SIZE entries

// Must run every tick to reset history.
export function trackFuelConsumption(snap: SimSnapshot): void {
  if (!snap.player) {
    // Not in our own car = no fuel level available.
    // Discard old sample, so getting back in doesn't compare it against long-stale value
    lastFuelLapSample = null
    return
  }

  const { lap, fuelLevelL: fuelLevel } = snap.player

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

  // New lap just started. This fuel level is the baseline for it.
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
  // not the live fuelLevelL. See FuelLapEstimate's doc comment for why.
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
// values for those cases. Just defensive caps well beyond any real race.
const UNLIMITED_LAPS_THRESHOLD = 100_000
const UNLIMITED_SECONDS_THRESHOLD = 24 * 60 * 60 // 24h, longer than any real enduro

// Whether the session has a real end at all (a lap or time limit). Checked
// directly on the raw SDK fields, independent of whether we can currently
// price that in as a lap count. The leader's pace might not be known yet
// early in a session. That's a separate "unknown pace" case, see leaderLapTimeSec().
function sessionHasRealEnd(snap: SimSnapshot): boolean {
  const lapsByCount = snap.session.lapsRemain ?? Number.POSITIVE_INFINITY
  const timeRemainSec = snap.session.timeRemainSec ?? Number.POSITIVE_INFINITY
  return lapsByCount < UNLIMITED_LAPS_THRESHOLD || timeRemainSec < UNLIMITED_SECONDS_THRESHOLD
}

// Race leader's own pace. This is what actually determines when the
// checkered flag comes out, regardless of whose estimate we're computing.
// Falls back to the class's estimated lap time if the leader hasn't set a lap
// time yet (e.g. still on their out-lap). That estimate is available from the
// start of the session, not only once a lap has actually been driven.
// Returns -1 only if there's no leader entry at all to look this up on.
function leaderLapTimeSec(snap: SimSnapshot): number {
  const leaderCarIdx = snap.session.leaderCarIdx
  if (leaderCarIdx < 0) return -1

  const leader = snap.cars.find((car) => car.carIdx === leaderCarIdx)
  const measured = leader?.lastLapTime ?? -1
  if (measured > 0) return measured

  const estimate = leader?.classEstLapTime ?? -1
  return estimate > 0 ? estimate : -1
}

// Real-world seconds left before the session ends, covering both lap-limited
// and time-limited races.
// The laps remaining are tied to the race LEADER crossing the line, not to
// our own lap count. So if we are a lap (or more) behind, that many "laps to
// go" corresponds to MORE real seconds than the same number of our own laps
// would take.
// Converted via the leader's own pace, not ours, before comparing against
// the remaining time (already real seconds). Whichever ends the session sooner wins.
function estimateSecondsRemaining(snap: SimSnapshot): number {
  const lapsByCount = snap.session.lapsRemain ?? Number.POSITIVE_INFINITY
  const timeRemainSec = snap.session.timeRemainSec ?? Number.POSITIVE_INFINITY

  const leaderPace = leaderLapTimeSec(snap)
  const secondsByLaps = Number.isFinite(lapsByCount) && leaderPace > 0
    ? lapsByCount * leaderPace
    : Number.POSITIVE_INFINITY

  return Math.min(secondsByLaps, timeRemainSec)
}

// Laps WE will still drive before the session ends.
// Takes the real seconds remaining (see estimateSecondsRemaining()) and
// converts it via OUR OWN pace. Our own pace determines how many more laps
// we personally get to complete, and therefore how much fuel we still need.
// Returns null if the session has no real end (see sessionHasRealEnd()), or
// if we don't have a usable pace of our own yet.
function estimateLapsRemaining(snap: SimSnapshot, lastLapTimeSec: number): number | null {
  if (lastLapTimeSec <= 0 || !sessionHasRealEnd(snap)) return null

  const secondsRemaining = estimateSecondsRemaining(snap)
  if (!Number.isFinite(secondsRemaining)) return null

  return secondsRemaining / lastLapTimeSec
}

// "Laps to go" for the race as a whole (leader-anchored). Used for e.g. the
// Standings header, shown regardless of who is focused or spectating.
// Uses the same real seconds remaining as estimateLapsRemaining(), just
// converted back via the LEADER's own pace instead of a specific driver's.
// Returns null only if the session has no real end at all (hide the display).
// NOT if the leader simply hasn't set a real lap time yet, leaderLapTimeSec()
// already covers that case with its own class estimate fallback.
export function estimateRaceLapsRemaining(snap: SimSnapshot): number | null {
  if (!sessionHasRealEnd(snap)) return null

  const pace = leaderLapTimeSec(snap)
  if (pace <= 0) return null

  const secondsRemaining = estimateSecondsRemaining(snap)
  if (!Number.isFinite(secondsRemaining)) return null

  return secondsRemaining / pace
}

// Additional pit stops needed for fuel before the session ends. Assumes a
// full refill every stop.
// This is the simplest strategy, and the only one possible without knowing
// the driver's actual planned fill amounts ahead of time.
function estimateStopsRemaining(
  snap: SimSnapshot,
  player: SimPlayerCar,
  consumptionPerLapL: number,
  lastLapTimeSec: number
): number | null {
  if (consumptionPerLapL <= 0) return null

  const lapsRemaining = estimateLapsRemaining(snap, lastLapTimeSec)
  if (lapsRemaining === null) return null

  if (player.fuelCapacityL <= 0) return null

  const fuelNeededL = lapsRemaining * consumptionPerLapL - player.fuelLevelL
  return Math.max(0, Math.ceil(fuelNeededL / player.fuelCapacityL))
}

export function buildFuelEstimate(snap: SimSnapshot, player: SimPlayerCar): FuelEstimate | null {
  if (fuelPerLapHistory.length === 0) return null

  const { fuelLevelL, lap: currentLap } = player

  // Fuel level as of this lap's start (tracked in trackFuelConsumption()).
  // Falls back to the live level if unavailable, e.g. right after getting
  // back in the car.
  const lapStartFuelLevelL = lastFuelLapSample?.fuelLevel ?? fuelLevelL

  const lastLapConsumption = fuelPerLapHistory[fuelPerLapHistory.length - 1]
  const avgConsumption = fuelPerLapHistory.reduce((sum, v) => sum + v, 0) / fuelPerLapHistory.length
  // No dedicated "current pace" value. Last completed lap is the closest estimate.
  const lastLapTimeSec = player.lapLastTime

  return {
    lastLap: buildFuelLapEstimate(lastLapConsumption, fuelLevelL, lapStartFuelLevelL, currentLap),
    avgLast5: buildFuelLapEstimate(avgConsumption, fuelLevelL, lapStartFuelLevelL, currentLap),
    nextPitFuelL: player.nextPitFuelL,
    // Uses the average-of-5 consumption rather than last-lap. This projects
    // across many remaining laps, so a stable rate matters more here than
    // reacting fast to a single outlier lap.
    stopsRemaining: estimateStopsRemaining(snap, player, avgConsumption, lastLapTimeSec)
  }
}
