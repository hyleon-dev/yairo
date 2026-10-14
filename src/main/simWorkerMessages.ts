import type {
  DriverLapCompletedEvent,
  FlagsData,
  RelativeData,
  StandingsData,
  TelemetryData,
  TrackMapData,
  TrackShape
} from '../shared/types'

// Messages simWorker.ts (worker thread) sends to simService.ts
// (main thread) via postMessage.
export type SimWorkerMessage =
    | { type: 'connected' }
    | { type: 'disconnected' }
    | { type: 'needs-setup'; value: boolean }
    | { type: 'telemetry'; data: TelemetryData }
    | { type: 'standings'; data: StandingsData }
    | { type: 'relative'; data: RelativeData }
    | { type: 'trackmap'; data: TrackMapData }
    | { type: 'flags'; data: FlagsData }
    // Only sent when the track layout changes.
    | { type: 'track-shape'; data: TrackShape | null }
    // One or more drivers completed a lap since the last tick (see
    // checkLapCompletions() in sim/core/tracking.ts). Only sent when something
    // actually happened, not every tick.
    | { type: 'lap-completed'; events: DriverLapCompletedEvent[] }
    // Periodic (throttled) heartbeat with the remaining session time. Lets
    // driverStatsStore.ts keep pushing forward the driver-history expiry
    // date (see DriverStatsStore.updateSessionExpiry()).
    | { type: 'session-heartbeat'; sessionTimeRemainSec: number }

// Commands in the other direction: simService.ts (main thread) to
// simWorker.ts (worker thread), e.g. when overlay settings change in Control Center.
export type SimWorkerCommand =
    | { type: 'set-relative-window'; ahead: number; behind: number }
    | { type: 'set-standings-window'; ahead: number; behind: number; topCount: number }
    // Ends the worker between two frames. Worker.terminate() during a blocking native
    // SDK call crashes the whole process (napi_throw into a dying environment).
    | { type: 'stop' }
