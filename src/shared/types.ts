/**
 * Central type definitions shared by the main process AND both renderers
 * (Control + Overlays), keeping the IPC boundary type-safe.
 */

// --- Telemetry -------------------------------------------------------

// Subset of iRacing telemetry actually forwarded to overlays, kept small to just what overlays need.
export interface TelemetryData {
  sim: SimulatorId
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
  // 0..100. Set for LMU cars with virtual energy, fuel estimates are then in % VE instead of liters.
  virtualEnergyPct: number | null
  lap: number
  lapDistPct: number // 0..1, position on track
  isOnTrack: boolean
  lapCurrentTime: number // s, -1 if no valid time yet
  lapLastTime: number // s, -1 if no lap driven yet
  lapBestTime: number // s, -1 if no valid best yet
  lapDeltaToBest: number // s, positive = slower than best lap
  // Mirrors the SDK's LapDeltaToBestLap_OK. It is false right after a new best lap,
  // or while spectating. Reason: iRacing needs a completed reference lap to compare
  // live splits against. It can't show a delta for the very lap that just set the
  // record. When this is false, lapDeltaToBest is meaningless (usually just 0).
  // The UI should hide the delta instead of showing a fake "on pace".
  lapDeltaToBestValid: boolean
  // Mirrors the SDK's OnPitRoad. True anywhere between the pit lane's entry and
  // exit cones (driving through, or stopped in our stall). False on the racing
  // surface. Always false while spectating.
  isOnPitRoad: boolean
  // Mirrors the SDK's EngineWarnings pit speed limiter bit. Always false while spectating.
  pitLimiterActive: boolean
  // Approximation of a car's own low-fuel dash warning (e.g. GT3). iRacing does not
  // expose that per-car threshold via telemetry. So this fires below a fixed fuel
  // percentage instead. Always false while spectating.
  lowFuelWarning: boolean
  // true when this data is from the driver being watched (spectating), not our own car.
  isSpectatingOther: boolean
  // null while spectating. Consumption values inside stay null until a full lap
  // with known consumption has been driven (fresh into the session, or just left the pits).
  fuelEstimate: FuelEstimate | null
  incidentCount: number
  // Incidents of whoever is CURRENTLY driving our team car (SDK: PlayerCarDriverIncidentCount).
  // Unlike incidentCount, this does not follow the camera. In a driver swap, it keeps
  // showing the driving teammate, even while spectating. -1 = not available yet.
  currentDriverIncidentCount: number
  // Team incidents this session (SDK: PlayerCarTeamIncidentCount),
  // identical to currentDriverIncidentCount in solo events
  // (one driver = one "team").
  //-1 = not available yet.
  teamIncidentCount: number
  // Raw string from WeekendInfo.WeekendOptions.IncidentLimit, e.g. "17x" or "unlimited".
  // Empty string if the SDK hasn't provided anything yet.
  incidentLimit: string
  // While spectating only set if the sim has tires for the watched car, see hasTireData.
  tires: TiresData
  // False if tires is only zero filler. LMU online has no tire data for other drivers.
  hasTireData: boolean
  // Own car only. null while spectating or if the sim has no damage data (iRacing).
  damage: DamageData | null
  // Own car only. null while spectating or if the sim has no track limits points (iRacing).
  trackLimits: TrackLimits | null
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

export interface TrackLimits {
  points: number
  penaltyAtPoints: number // a penalty is given when points reach this
}

export type DamageLevel = 0 | 1 | 2 // none, some, heavy
export type WheelDamage = 'ok' | 'flat' | 'detached'

export interface DamageData {
  body: {
    front: DamageLevel
    frontRight: DamageLevel
    right: DamageLevel
    rearRight: DamageLevel
    rear: DamageLevel
    rearLeft: DamageLevel
    left: DamageLevel
    frontLeft: DamageLevel
  }
  wheels: { lf: WheelDamage; rf: WheelDamage; lr: WheelDamage; rr: WheelDamage }
  overheating: boolean
  partsDetached: boolean
}

// A consumption projection for one scenario (last lap, or avg of the last 5).
// Separate from the raw fuel level in TelemetryData.fuelLevelL.
// Amounts are in liters, or in % VE if TelemetryData.virtualEnergyPct is set.
export interface FuelLapEstimate {
  consumptionPerLap: number
  // How many more laps the current (live) fuel level covers in this scenario.
  // Ticks down continuously as fuel burns, including mid-lap.
  lapsRemaining: number
  // Left over after the last fully possible lap (a safety margin, if pitting
  // exactly at "pitByLap").
  // Unlike lapsRemaining, this value (and pitByLap) is only recomputed once per lap,
  // from the fuel level at THIS lap's start. It does not update live or mid-lap.
  // Reason: live updates would turn it into a sawtooth. It would fall in lockstep
  // with the live tank level, then jump back up by a full consumptionPerLap
  // whenever the live level crosses a multiple-of-consumption threshold mid-lap.
  // That threshold crossing is unrelated to actual lap boundaries, so the jump
  // would be confusing. This is not meant to be a stable "pit-plan buffer".
  margin: number
  // Absolute lap number by which to pit at the latest. Same once-per-lap
  // stability as margin, for the same reason.
  pitByLap: number
}

// iRacing itself provides neither consumption nor a range estimate. Both are computed
// here from the per-lap fuel-level history (see trackFuelConsumption() in irsdkWorker.ts).
export interface FuelLapConsumption {
  lap: number
  consumption: number // liters or % VE, like FuelLapEstimate
}

export interface FuelEstimate {
  lastLap: FuelLapEstimate | null
  avgLast5: FuelLapEstimate | null
  lapHistory: FuelLapConsumption[] // oldest first, last 5 full laps
  // Amount added at the next pit stop, liters or % VE, from the sim's pit menu.
  // iRacing: PitSvFuel, tracks "Auto Fill" live. LMU: VE target minus current VE.
  // null while not driving our own car or if the pit menu is unknown.
  nextPitFill: number | null
  // s, estimated standing time of the next stop with the current pit menu. LMU only.
  pitStopTimeSec: number | null
  // How many more pit stops for fuel are needed before the session ends. Assumes
  // a full refill every stop (see estimateStopsRemaining() in irsdkWorker.ts for
  // the underlying laps-to-go/consumption math). null without a consumption
  // estimate yet, or if the session has no usable end (laps or time) to project against.
  stopsRemaining: number | null
}

// Sent when iRacing isn't running / no session is active.
export interface ConnectionStatus {
  connected: boolean
  // Sim runs but provides no data, e.g. LMU without "Enable Plugins".
  needsSetup: boolean
}

// --- Update check ---------------------------------------------------------

// Result of comparing the running app version against the latest GitHub
// release (see updateChecker.ts). Purely informational, no auto-download/
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
  // iRacing does not provide this itself. It is computed from the last completed
  // lap count observed while in the pits (see updateStintTracking() in irsdkWorker.ts).
  stintLaps: number
  gapToLeaderSec: number // from CarIdxF2Time: deficit to the leader, in s
  bestLapTime: number // s, <= 0 if no valid time yet
  isClassFastestLap: boolean
  isPlayer: boolean
  iRating: number | null // null if the sim has no iRating
  // Estimated iRating change if the race ended right now, with drivers in their
  // CURRENT live position order (see iratingCalculator.ts). This is NOT a
  // finish-position prediction. It is based only on where everyone stands at this
  // instant. null outside a race session, or if this driver has no valid iRating
  // (e.g. missing driver data).
  iRatingChange: number | null
  licString: string | null // Safety Rating string as given by the SDK, e.g. "A 4.99". null if the sim has none.
  // Official iRacing license class color as a CSS hex code. Derived from licString's
  // letter (licenseColorHex() in irsdkWorker.ts). This is NOT the SDK's own
  // Driver.LicColor, which can report the wrong color for a driver's actual license class.
  licColorHex: string | null
  classColorHex: string // Car class color, taken directly from the SDK (Driver.CarClassColor) as a CSS hex code.
  // Average of every lap time recorded for the CURRENT driver of this car,
  // during the current session.
  // Not from the SDK. Accumulated lap by lap in irsdkWorker.ts, keyed by
  // Driver.UserID so a team driver swap does not mix drivers' laps.
  // -1 if this driver has not completed a lap yet.
  avgLapTimeSec: number
  // Resolved from the driver's iRacing "FlairName" (nationality) via
  // flairNameToIsoCode() in nationFlags.ts. Gives a flag-icons ISO code (e.g. "de").
  // null if there is no flag data, or the name did not resolve to one.
  flagIsoCode: string | null
  // Resolved from the car's CarScreenName.
  // Null if no known manufacturer keyword matched.
  manufacturerLogoKey: string | null
  pitStops: number | null // null if the sim doesn't count them
  penalties: number | null // outstanding penalties, null if the sim has none
  lastLapTime: number
  // Laps this driver is behind the class leader's completed lap count.
  // 0 while on the leader's lap (or ahead, e.g. during a formation lap).
  lapsDown: number
}

export interface StandingsClass {
  classId: number
  className: string
  driverCount: number
  // Not from the SDK, computed with the official formula. null without iRatings.
  strengthOfField: number | null
  drivers: DriverStanding[]
}

export interface StandingsData {
  sim: SimulatorId
  trackName: string
  sessionType: string
  remainingTimeSecs: number
  // Estimated laps to go for the race as a whole. Leader-anchored, not tied to
  // whoever is focused/spectating (see estimateRaceLapsRemaining() in irsdkWorker.ts).
  // null outside a session with a real end (laps or time), or before the leader has
  // a known lap time yet.
  lapsRemaining: number | null
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
  isInPit: boolean
  // See DriverStanding.
  iRating: number | null
  iRatingChange: number | null
  licString: string | null
  licColorHex: string | null
  classColorHex: string // Car class color, taken directly from the SDK (Driver.CarClassColor) as a CSS hex code.
  // See DriverStanding.avgLapTimeSec.
  avgLapTimeSec: number
  lastLapTime: number
}

export interface RelativeData {
  sim: SimulatorId
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
  // Position in TrackShape coordinates. Only set by sims with world positions (LMU).
  x?: number
  y?: number
}

// Track outline in world coordinates (meters, y = north). Comes from the sim (LMU),
// not from the bundled iRacing SVGs. Sent only when the layout changes.
export interface TrackShape {
  key: string
  trackPath: string
  pitPath: string
  // SVG transform for paths and cars. Tracks are rotated to fill the landscape overlay.
  transform: string
  viewBox: string
}

export interface TrackMapData {
  sim: SimulatorId
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
  sim: SimulatorId
  flags: number // raw SessionFlags bitmask, decode with FLAG_BITS
}

// --- Driver Stats (persistent driver history, keyed by iRacing CustID) ----
//
// iRacing itself does not expose an average/median lap time per driver. So every
// completed lap of every driver is recorded here, to be aggregated later.

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
  | 'delta-bar'
  | 'damage'

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

export type SimulatorId = 'iracing' | 'lmu'

export const SIMULATOR_IDS: readonly SimulatorId[] = ['iracing', 'lmu']

export const DEFAULT_SIMULATOR: SimulatorId = 'iracing'

export interface SimFeatures {
  // iRating, Safety Rating and Strength of Field.
  driverRatings: boolean
  // Tire data updates while driving, not only in the pits.
  liveTires: boolean
  pitStopCounts: boolean
  pitStopEstimate: boolean
  // Track rubber/grip state in the Standings header.
  trackGrip: boolean
  // Outstanding penalty per car (LMU count, iRacing black flag).
  penaltyFlags: boolean
  // Hidden in the Control Center, window stays closed. The enabled setting is kept.
  unsupportedOverlays: readonly OverlayId[]
}

export const SIM_FEATURES: Record<SimulatorId, SimFeatures> = {
  iracing: { driverRatings: true, liveTires: false, pitStopCounts: false, pitStopEstimate: false, trackGrip: true, penaltyFlags: true, unsupportedOverlays: ['damage'] },
  lmu: { driverRatings: false, liveTires: true, pitStopCounts: true, pitStopEstimate: true, trackGrip: false, penaltyFlags: true, unsupportedOverlays: ['incidents'] }
}

export function isOverlaySupported(sim: SimulatorId, id: OverlayId): boolean {
  return !SIM_FEATURES[sim].unsupportedOverlays.includes(id)
}

// 'none' = no correction. The others apply a daltonization filter (see
// shared/colorCorrectionFilters.ts). This only ever runs in the Control Center and
// the real Electron overlay windows. It deliberately does NOT run for OBS/browser
// clients (see useOverlayBridge.ts). A streamer's viewers should see normal colors,
// even if the streamer uses this for their own screen.
export type ColorCorrectionMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'

export const DEFAULT_COLOR_CORRECTION_MODE: ColorCorrectionMode = 'none'

/** Full state managed and persisted by the Control Center. */
export interface AppConfig {
  // Layout of the active simulator. Each simulator keeps its own (see configStore.ts).
  overlays: OverlayConfig[]
  editMode: boolean
  // null until the user has moved/resized the Control Center window once.
  controlWindowBounds: OverlayBounds | null
  // Hex color (e.g. "#e8401a"), applied to --color-accent/--color-accent-rgb
  // in theme.css on every window (Control Center + overlays).
  accentColor: string
  colorCorrectionMode: ColorCorrectionMode
  // s, <= 0 = no target set. Shared by every overlay that compares against a target
  // lap (Lap Timer, Delta Bar, ...). Kept per simulator, like overlays.
  targetLapTimeSec: number
  // Chosen by the user in the Control Center. No auto-detection.
  simulator: SimulatorId
}

// The accent color hardcoded in theme.css (--color-accent) before the user
// picks their own. What the Control Center's "reset" button restores.
export const DEFAULT_ACCENT_COLOR = '#e8401a'

export interface BaseOverlaySettings {
  /** Scale factor for the whole overlay, 1 = 100%. */
  scale: number
  /** Panel background opacity, 0 = fully transparent, 1 = fully opaque. */
  opacity: number
}

export interface DriverRatingOverlaySettings {
  showIRating: boolean
  showIRatingChange: boolean
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

export interface LastLapTimeOverlaySettings {
  showLastLapTime: boolean
}

export interface RelativeOverlaySettings
  extends BaseOverlaySettings, DriverRatingOverlaySettings, StintOverlaySettings, AvgLapTimeOverlaySettings, LastLapTimeOverlaySettings {
  driversAhead: number // How many drivers ahead of the player are shown.
  driversBehind: number // How many drivers behind the player are shown.
}

export interface StandingsOverlaySettings
  extends BaseOverlaySettings, DriverRatingOverlaySettings, StintOverlaySettings, AvgLapTimeOverlaySettings, BestLapTimeOverlaySettings, LastLapTimeOverlaySettings {
  driversAhead: number // How many drivers ahead of the player are shown.
  driversBehind: number // How many drivers behind the player are shown.
  topCount: number // These leading drivers (P1, P2, ...) are always shown.
  showNationFlag: boolean // Shows the driver's country flag.
  showManufacturerLogo: boolean // Shows the car's manufacturer logo.
  showRealTime: boolean // Shows real time in header.
  showPitStops: boolean
  showPenalties: boolean
}

export interface TiresOverlaySettings extends BaseOverlaySettings {
  /** Shows the wear percentage number inside each tire gauge. */
  showWearPct: boolean
}

export interface TelemetryOverlaySettings extends BaseOverlaySettings {
  /** Shows the numeric RPM readout next to the shift-light LED bar. */
  showRpmNumber: boolean
}

export interface FuelOverlaySettings extends BaseOverlaySettings {
  showLapHistory: boolean
}

export interface FlagsOverlaySettings extends BaseOverlaySettings {
  /** Shows the flag name (e.g. "CAUTION") below the LED grid. */
  showLabel: boolean
}

export interface DeltaBarOverlaySettings extends BaseOverlaySettings {
  /** Shows the numeric delta below the bar. */
  showDeltaNumber: boolean
  /** px, width of the bar itself (independent of the overlay's own "scale" setting). */
  barWidthPx: number
}

export type OverlaySettingsMap = {
  telemetry: TelemetryOverlaySettings
  fuel: FuelOverlaySettings
  'lap-timer': BaseOverlaySettings
  incidents: BaseOverlaySettings
  standings: StandingsOverlaySettings
  relative: RelativeOverlaySettings
  trackmap: BaseOverlaySettings
  tires: TiresOverlaySettings
  flags: FlagsOverlaySettings
  'delta-bar': DeltaBarOverlaySettings
  damage: BaseOverlaySettings
}

export type AnyOverlaySettings = OverlaySettingsMap[OverlayId]

// Default opacity matches the shared --panel-bg alpha in theme.css (0.85).
// trackmap is the one exception, matching its own --panel-bg-light (0.35),
// see the "Panel-Hintergrund bewusst anders" note in CLAUDE.md.
const DEFAULT_PANEL_OPACITY = 0.85
const DEFAULT_TRACKMAP_OPACITY = 0.35

export const DEFAULT_OVERLAY_SETTINGS: OverlaySettingsMap = {
  telemetry: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showRpmNumber: true },
  fuel: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showLapHistory: true },
  'lap-timer': { scale: 1, opacity: DEFAULT_PANEL_OPACITY },
  incidents: { scale: 1, opacity: DEFAULT_PANEL_OPACITY },
  standings: {
    scale: 1,
    opacity: DEFAULT_PANEL_OPACITY,
    driversAhead: 3,
    driversBehind: 3,
    topCount: 3,
    showIRating: true,
    showIRatingChange: true,
    showSafetyRating: true,
    showStint: true,
    showAvgLapTime: true,
    showBestLapTime: true,
    showNationFlag: false,
    showManufacturerLogo: false,
    showPitStops: false,
    showPenalties: false,
    showLastLapTime: true,
    showRealTime: false
  },
  relative: {
    scale: 1,
    opacity: DEFAULT_PANEL_OPACITY,
    driversAhead: 3,
    driversBehind: 3,
    showIRating: true,
    showIRatingChange: false,
    showSafetyRating: true,
    showStint: true,
    showAvgLapTime: false,
    showLastLapTime: true
  },
  trackmap: { scale: 1, opacity: DEFAULT_TRACKMAP_OPACITY },
  tires: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showWearPct: true },
  flags: { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showLabel: false },
  // opacity is unused (no panel background), kept only because BaseOverlaySettings requires it.
  'delta-bar': { scale: 1, opacity: DEFAULT_PANEL_OPACITY, showDeltaNumber: true, barWidthPx: 360 },
  damage: { scale: 1, opacity: DEFAULT_PANEL_OPACITY }
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
  TRACK_SHAPE_UPDATE: 'track-shape:update',
  FLAGS_UPDATE: 'flags:update',
  CONNECTION_STATUS: 'connection:status',
  CONFIG_UPDATED: 'config:updated',

  // Renderer -> main (invoke/handle)
  CONFIG_GET: 'config:get',
  TRACK_SHAPE_GET: 'track-shape:get',
  CONFIG_SET_OVERLAY: 'config:set-overlay',
  EDIT_MODE_SET: 'edit-mode:set',
  ACCENT_COLOR_SET: 'accent-color:set',
  COLOR_CORRECTION_MODE_SET: 'color-correction-mode:set',
  TARGET_LAP_TIME_SET: 'target-lap-time:set',
  SIMULATOR_SET: 'simulator:set',
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
