import type { TelemetryData } from '../../../shared/types'

// Shared by LapTimerOverlay and DeltaBarOverlay: both compare the current lap
// against either the best lap (SDK-provided) or a user-set target lap time.

// For delta to best lap: data.lapDeltaToBest straight from iRacing's own LapDeltaToBestLap SDK value.
// For delta to target lap: where we'd be right now if pacing the target exactly
// (targetLapTimeSec * lapDistPct), vs where we actually are.
export function computeLapDelta(data: TelemetryData, targetLapTimeSec: number): number {
  if (targetLapTimeSec <= 0) return data.lapDeltaToBest
  const currentTime = data.lapCurrentTime >= 0 ? data.lapCurrentTime : 0
  return currentTime - targetLapTimeSec * data.lapDistPct
}

// Without a target, we depend on the SDK's own delta, which isn't valid right
// after a new best lap (see lapDeltaToBestValid's doc comment), false rather
// than showing a misleading "+0.000" during that window.
export function isLapDeltaValid(data: TelemetryData, targetLapTimeSec: number): boolean {
  return !data.isSpectatingOther && (targetLapTimeSec > 0 || data.lapDeltaToBestValid)
}
