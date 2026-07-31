import type {
  DriverLapCompletedEvent,
  FlagsData,
  RelativeData,
  StandingsData,
  TelemetryData,
  TrackMapData
} from '../shared/types'

// Messages irsdkWorker.ts (worker thread) sends to irsdkService.ts
// (main thread) via postMessage.
export type IrsdkWorkerMessage =
    | { type: 'connected' }
    | { type: 'disconnected' }
    | { type: 'telemetry'; data: TelemetryData }
    | { type: 'standings'; data: StandingsData }
    | { type: 'relative'; data: RelativeData }
    | { type: 'trackmap'; data: TrackMapData }
    | { type: 'flags'; data: FlagsData }
    // One or more drivers completed a lap since the last tick (see
    // checkLapCompletions() in irsdkWorker.ts);
    // only sent when something actually happened (not every tick).
    | { type: 'lap-completed'; events: DriverLapCompletedEvent[] }
    // Periodic (throttled) heartbeat with the remaining session time, so
    // driverStatsStore.ts can keep pushing forward the driver-history expiry
    // date (see DriverStatsStore.updateSessionExpiry()).
    | { type: 'session-heartbeat'; sessionTimeRemainSec: number }

// Commands in the other direction: irsdkService.ts (main thread) to
// irsdkWorker.ts (worker thread), e.g. when overlay settings change in Control Center.
export type IrsdkWorkerCommand =
    | { type: 'set-relative-window'; ahead: number; behind: number }
    | { type: 'set-standings-window'; ahead: number; behind: number; topCount: number }
