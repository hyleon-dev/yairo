/**
 * Central type definitions shared by the main process AND both renderers
 * (Control + Overlays), keeping the IPC boundary type-safe.
 */

// --- Telemetry -------------------------------------------------------

// Subset of iRacing telemetry actually forwarded to overlays.
// Only what overlays need, to keep the payload small.
export interface TelemetryData {
  speedKph: number
  rpm: number
  rpmIdle: number
  rpmSLFirst: number
  rpmSLShift: number
  rpmSLLast: number
  rpmSLBlink: number
  gear: number // -1 = reverse, 0 = neutral, 1..n = gear
  throttlePct: number // 0..1
  brakePct: number // 0..1
  // 0 = released, 1 = fully pressed
  // The SDK's "Clutch" is the OPPOSITE convention,
  // inverted here to match throttlePct/brakePct.
  clutchPct: number
  fuelLevelL: number
  lap: number
  lapDistPct: number // 0..1, position on track
  isOnTrack: boolean
  lapCurrentTime: number // s, -1 if no valid time yet
  lapLastTime: number // s, -1 if no lap driven yet
  lapBestTime: number // s, -1 if no valid best yet
  lapDeltaToBest: number // s, positive = slower than best lap
  // true if this data is from the driver being watched
  // (spectating/not in our own car) rather than our own car.
  isSpectatingOther: boolean
  // null until a full lap with known consumption has been driven (fresh
  // into the session, or just left the pits), or while spectating.
  fuelEstimate: FuelEstimate | null
  incidentCount: number
  // Incidents of whoever is CURRENTLY driving our team car
  //(SDK: PlayerCarDriverIncidentCount), unlike incidentCount above, this does
  // NOT follow the camera (CamCarIdx).
  // Equals incidentCount while we're driving.
  // In a team event with a driver swap, it keeps showing the currently driving teammate,
  // even while we're spectating/out of the car.
  // -1 = not available yet.
  currentDriverIncidentCount: number
  // Team incidents this session (SDK: PlayerCarTeamIncidentCount),
  // identical to currentDriverIncidentCount in solo events
  // (one driver = one "team").
  //-1 = not available yet.
  teamIncidentCount: number
  // Raw string from WeekendInfo.WeekendOptions.IncidentLimit, e.g. "17x" or "unlimited".
  // Empty string if the SDK hasn't provided anything yet.
  incidentLimit: string
  // Only meaningful while actually driving (own car), see isSpectatingOther.
  tires: TiresData
}

// --- Tires ------------------------------------------------------------

// One corner of the car. wearPct/tempC are each averaged across the SDK's
// three measurement zones (inner/middle/outer) per tire.
export interface TireWheelData {
  wearPct: number // 0..100, percent tread remaining. 0 = worn through/flat.
  tempC: number
  tempUnit: string
}

export interface TiresData {
  lf: TireWheelData
  rf: TireWheelData
  lr: TireWheelData
  rr: TireWheelData
}

// A consumption projection for one scenario (last lap or average of the last 5 laps).
// The fuel level itself is already in TelemetryData.fuelLevelL, this is just what can
// be projected from it for this scenario.
export interface FuelLapEstimate {
  // L, consumption per lap in this scenario.
  consumptionPerLapL: number
  // How many more laps the current fuel level covers in this scenario.
  lapsRemaining: number
  // L, left over after the last fully possible lap
  // (safety margin, if pitting exactly at "pitByLap").
  marginLiters: number
  // Absolute lap number by which to pit at the latest.
  pitByLap: number
}

// Fuel projection for our own car, one based on the last completed lap and
// one based on the average of the last (up to) 5 laps.
// iRacing itself provides neither data, so it's computed from the per-lap
// fuel-level history (see trackFuelConsumption() in irsdkWorker.ts).
export interface FuelEstimate {
  lastLap: FuelLapEstimate | null
  avgLast5: FuelLapEstimate | null
}

// Sent when iRacing isn't running / no session is active.
export interface ConnectionStatus {
  connected: boolean
}

// --- Update check ---------------------------------------------------------

// Result of comparing the running app version against the latest GitHub
// release (see updateChecker.ts). Purely informational - no auto-download/
// install, just a banner + link in the Control Center.
export interface UpdateStatus {
  available: boolean
  currentVersion: string
  latestVersion?: string
  url?: string
}

// --- Overlay screenshots ---------------------------------------------------

// Result of the Control Center's "Screenshot" button per overlay.
export interface OverlayScreenshotResult {
  success: boolean
  path?: string
}

// --- Standings ----------------------------------------------------------

export interface DriverStanding {
  carIdx: number
  position: number
  carNumber: string
  driverName: string
  lapsCompleted: number
  // Laps since the last pit stop (or since session start if not pitted yet).
  // iRacing doesn't provide this itself, computed from the last completed lap
  // count observed while in the pits.
  // (see updateStintTracking() in irsdkWorker.ts).
  stintLaps: number
  gapToLeaderSec: number // from CarIdxF2Time: deficit to the leader, in s
  bestLapTime: number // s, <= 0 if no valid time yet
  isClassFastestLap: boolean
  isPlayer: boolean
  iRating: number
  licString: string // Safety Rating string as given by the SDK, e.g. "A 4.99".
  licColorHex: string // License class color, taken directly from the SDK (Driver.LicColor) as a CSS hex code.
  classColorHex: string // Car class color, taken directly from the SDK (Driver.CarClassColor) as a CSS hex code.
  // Average of every lap time recorded for the CURRENT driver of this car
  // during the current session.
  // Not from the SDK: accumulated lap by lap in irsdkWorker.ts,
  // keyed by Driver.UserID so a team driver swap doesn't mix drivers' laps.
  // -1 if this driver hasn't completed a lap yet.
  avgLapTimeSec: number
}

export interface StandingsClass {
  classId: number
  className: string
  driverCount: number
  strengthOfField: number // not directly from SDK but computed with official strength-of-field formula.
  drivers: DriverStanding[]
}

export interface StandingsData {
  trackName: string
  sessionType: string
  remainingTimeSecs: number
  airTemp: number
  airTempUnit: string
  trackTemp: number
  trackTempUnit: string
  grip: string
  // One entry per car class, sorted by strengthOfField descending
  // (fastest class first, matching iRacing's own multiclass results ordering).
  // A single-class session still has exactly one entry here.
  classes: StandingsClass[]
}

// --- Relative -------------------------------------------------------------

export interface RelativeDriver {
  carIdx: number
  position: number // Class position, not overall race position
  carNumber: string
  driverName: string
  lap: number
  stintLaps: number // Laps since the last pit stop
  gapToPlayerSec: number // Pure time gap on track, independent of which lap the other driver is on.
  lapsDifference: number // > 0 = driver is that many laps ahead, < 0 = that many laps behind.
  isPlayer: boolean
  iRating: number
  licString: string // Safety Rating string as given by the SDK, e.g. "A 4.99".
  licColorHex: string // License class color, taken directly from the SDK (Driver.LicColor) as a CSS hex code.
  classColorHex: string // Car class color, taken directly from the SDK (Driver.CarClassColor) as a CSS hex code.
  // See DriverStanding.avgLapTimeSec.
  avgLapTimeSec: number
}

export interface RelativeData {
  // Sorted front to back, player in the middle.
  drivers: RelativeDriver[]
}

// --- Track Map ------------------------------------------------------------

export type TrackSurfaceStatus = 'off-track' | 'in-pit-stall' | 'approaching-pits' | 'on-track'

export interface TrackMapDriver {
  carIdx: number
  carNumber: string
  driverName: string
  classColorHex: string
  lapDistPct: number // 0..1, position along the lap.
  surface: TrackSurfaceStatus
  isPlayer: boolean
}

export interface TrackMapData {
  trackId: number
  trackName: string
  drivers: TrackMapDriver[]
}

// --- Flags ------------------------------------------------------------

// Mirrors the relevant bits of irsdk_Flags
// (see @irsdk-node/types/dist/types/defines.d.ts, GlobalFlags enum)
export const FLAG_BITS = {
  checkered: 0x00000001,
  white: 0x00000002,
  green: 0x00000004,
  yellow: 0x00000008,
  red: 0x00000010,
  blue: 0x00000020,
  yellowWaving: 0x00000100,
  greenHeld: 0x00000400,
  caution: 0x00004000,
  cautionWaving: 0x00008000,
  black: 0x00010000,
  disqualify: 0x00020000,
  furled: 0x00080000,
  repair: 0x00100000
} as const

export interface FlagsData {
  flags: number // raw SessionFlags bitmask, decode with FLAG_BITS
}

// --- Driver Stats (persistent driver history, keyed by iRacing CustID) ----
//
// iRacing itself doesn't expose an average/median lap time per driver - so
// every completed lap of every driver is recorded here, to be aggregated later.

export interface DriverLapTimeEntry {
  lapTimeSec: number
  trackId: number
  trackName: string
  carId: number
  carName: string
  sessionType: string // "Race" | "Practice" | "Qualify" | ... (from SessionInfo.SessionType)
  recordedAt: number // Date.now() at capture time
}

export interface DriverRecord {
  custId: number
  driverName: string
  lapTimes: DriverLapTimeEntry[]
}

export type DriverStatsData = Record<number, DriverRecord>

// "Driver X completed lap Y" event detected by the worker thread (irsdkWorker.ts)
export interface DriverLapCompletedEvent {
  custId: number
  driverName: string
  entry: DriverLapTimeEntry
}

// --- Overlay configuration ---------------------------------------------

export type OverlayId =
  | 'telemetry'
  | 'fuel'
  | 'lap-timer'
  | 'incidents'
  | 'standings'
  | 'relative'
  | 'trackmap'
  | 'tires'
  | 'flags'

export interface OverlayBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayConfig {
  id: OverlayId
  name: string
  enabled: boolean
  bounds: OverlayBounds
}

// 'none' = no correction. The others apply a daltonization filter (see
// shared/colorCorrectionFilters.ts) - only ever applied in the Control Center and
// the real Electron overlay windows, deliberately NOT for OBS/browser clients
// (see useOverlayBridge.ts) - a streamer's viewers should see normal colors
// even if the streamer themselves uses this for their own screen.
export type ColorCorrectionMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'

export const DEFAULT_COLOR_CORRECTION_MODE: ColorCorrectionMode = 'none'

/** Full state managed and persisted by the Control Center. */
export interface AppConfig {
  overlays: OverlayConfig[]
  editMode: boolean
  // null until the user has moved/resized the Control Center window once.
  controlWindowBounds: OverlayBounds | null
  // Hex color (e.g. "#e8401a"), applied to --color-accent/--color-accent-rgb
  // in theme.css on every window (Control Center + overlays).
  accentColor: string
  colorCorrectionMode: ColorCorrectionMode
}

// The accent color hardcoded in theme.css (--color-accent) before the user
// picks their own - what the Control Center's "reset" button restores.
export const DEFAULT_ACCENT_COLOR = '#e8401a'

export interface BaseOverlaySettings {
  /** Scale factor for the whole overlay, 1 = 100%. */
  scale: number
  /** Panel background opacity, 0 = fully transparent, 1 = fully opaque. */
  opacity: number
}

export interface DriverRatingOverlaySettings {
  showIRating: boolean
  showSafetyRating: boolean
}

export interface StintOverlaySettings {
  showStint: boolean
}

export interface AvgLapTimeOverlaySettings {
  showAvgLapTime: boolean
}

export interface BestLapTimeOverlaySettings {
  showBestLapTime: boolean
}

export interface RelativeOverlaySettings
  extends BaseOverlaySettings, DriverRatingOverlaySettings, StintOverlaySettings, AvgLapTimeOverlaySettings {
  driversAhead: number // How many drivers ahead of the player are shown.
  driversBehind: number // How many drivers behind the player are shown.
}

export interface StandingsOverlaySettings
  extends BaseOverlaySettings, DriverRatingOverlaySettings, StintOverlaySettings, AvgLapTimeOverlaySettings, BestLapTimeOverlaySettings {
  driversAhead: number // How many drivers ahead of the player are shown.
  driversBehind: number // How many drivers behind the player are shown.
  topCount: number // These leading drivers (P1, P2, ...) are always shown.
}

export interface TiresOverlaySettings extends BaseOverlaySettings {
  /** Shows the wear percentage number inside each tire gauge. */
  showWearPct: boolean
}

export interface TelemetryOverlaySettings extends BaseOverlaySettings {
  /** Shows the numeric RPM readout next to the shift-light LED bar. */
  showRpmNumber: boolean
}

export interface FlagsOverlaySettings extends BaseOverlaySettings {
  /** Shows the flag name (e.g. "CAUTION") below the LED grid. */
  showLabel: boolean
}

export type OverlaySettingsMap = {
  telemetry: TelemetryOverlaySettings
  fuel: BaseOverlaySettings
  'lap-timer': BaseOverlaySettings
  incidents: BaseOverlaySettings
  standings: StandingsOverlaySettings
  relative: RelativeOverlaySettings
  trackmap: BaseOverlaySettings
  tires: TiresOverlaySettings
  flags: FlagsOverlaySettings
}

export type AnyOverlaySettings = OverlaySettingsMap[OverlayId]

// Default opacity matches the shared --panel-bg alpha in theme.css (0.85).
// trackmap is the one exception, matching its own --panel-bg-light (0.35) -
// see the "Panel-Hintergrund bewusst anders" note in CLAUDE.md.
const DEFAULT_PANEL_OPACITY = 0.85
const DEFAULT_TRACKMAP_OPACITY = 0.35

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettingsMap = {
  telemetry: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showRpmNumber: true },
  fuel: { scale: 1, opacity: DEFAULT_PANEL_OPACITY },
  'lap-timer': { scale: 1, opacity: DEFAULT_PANEL_OPACITY },
  incidents: { scale: 1, opacity: DEFAULT_PANEL_OPACITY },
  standings: {
    scale: 1,
    opacity: DEFAULT_PANEL_OPACITY,
    driversAhead: 3,
    driversBehind: 3,
    topCount: 3,
    showIRating: true,
    showSafetyRating: true,
    showStint: true,
    showAvgLapTime: true,
    showBestLapTime: true
  },
  relative: {
    scale: 1,
    opacity: DEFAULT_PANEL_OPACITY,
    driversAhead: 3,
    driversBehind: 3,
    showIRating: true,
    showSafetyRating: true,
    showStint: true,
    showAvgLapTime: false
  },
  trackmap: { scale: 1, opacity: DEFAULT_TRACKMAP_OPACITY },
  tires: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showWearPct: true },
  flags: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showLabel: false }
}

// Main -> renderer broadcast channel for a single overlay's settings, one channel per overlay id
export function overlaySettingsChannel(id: OverlayId): string {
  return `overlay-settings:updated:${id}`
}

// --- Local HTTP/WebSocket server for overlays in the browser -

export const OVERLAY_SERVER_PORT = 4380

// --- IPC channel names (as constants, to avoid main/renderer typos) -------

export const IPC = {
  // Main -> renderer (broadcast)
  TELEMETRY_UPDATE: 'telemetry:update',
  STANDINGS_UPDATE: 'standings:update',
  RELATIVE_UPDATE: 'relative:update',
  TRACKMAP_UPDATE: 'trackmap:update',
  FLAGS_UPDATE: 'flags:update',
  CONNECTION_STATUS: 'connection:status',
  CONFIG_UPDATED: 'config:updated',

  // Renderer -> main (invoke/handle)
  CONFIG_GET: 'config:get',
  CONFIG_SET_OVERLAY: 'config:set-overlay',
  EDIT_MODE_SET: 'edit-mode:set',
  ACCENT_COLOR_SET: 'accent-color:set',
  COLOR_CORRECTION_MODE_SET: 'color-correction-mode:set',
  OVERLAY_BOUNDS_SET: 'overlay:set-bounds',
  OVERLAY_CONTENT_SIZE_SET: 'overlay:set-content-size',
  OVERLAY_SETTINGS_GET: 'overlay-settings:get',
  OVERLAY_SETTINGS_SET: 'overlay-settings:set',
  DRIVER_STATS_GET_ALL: 'driver-stats:get-all',
  CONNECTION_STATUS_GET: 'connection-status:get',
  CLIPBOARD_WRITE: 'clipboard:write',
  UPDATE_STATUS_GET: 'update-status:get',
  UPDATE_STATUS: 'update-status',
  UPDATE_OPEN_RELEASE: 'update-status:open-release',
  OVERLAY_SCREENSHOT: 'overlay:screenshot',
  OVERLAY_SCREENSHOTS_ENABLED_GET: 'overlay:screenshots-enabled-get'
} as const
