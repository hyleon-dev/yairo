// Own types for the iRacing SDK data. Only the fields this app reads.
// Telemetry names and units: irsdk_defines.h and the var headers at runtime.

export const VAR_TYPE = { char: 0, bool: 1, int: 2, bitField: 3, float: 4, double: 5 } as const
export type VarType = (typeof VAR_TYPE)[keyof typeof VAR_TYPE]

export interface TelemetryVariable<T extends number | boolean = number> {
  name: string
  description: string
  unit: string
  countAsTime: boolean
  length: number
  varType: VarType
  value: T[]
}

type BoolVarName = 'IsOnTrack' | 'OnPitRoad' | 'LapDeltaToSessionBestLap_OK'

type NumberVarName =
  | 'AirTemp'
  | 'Brake'
  | 'CamCarIdx'
  | 'CarIdxBestLapTime'
  | 'CarIdxEstTime'
  | 'CarIdxF2Time'
  | 'CarIdxGear'
  | 'CarIdxLap'
  | 'CarIdxLapCompleted'
  | 'CarIdxLapDistPct'
  | 'CarIdxLastLapTime'
  | 'CarIdxPosition'
  | 'CarIdxRPM'
  | 'CarIdxSessionFlags'
  | 'CarIdxTrackSurface'
  | 'Clutch'
  | 'EngineWarnings'
  | 'FuelLevel'
  | 'FuelLevelPct'
  | 'Gear'
  | 'Lap'
  | 'LapBestLapTime'
  | 'LapCurrentLapTime'
  | 'LapDeltaToSessionBestLap'
  | 'LapDistPct'
  | 'LapLastLapTime'
  | 'PitSvFuel'
  | 'PlayerCarDriverIncidentCount'
  | 'PlayerCarIdx'
  | 'PlayerCarMyIncidentCount'
  | 'PlayerCarPosition'
  | 'PlayerCarTeamIncidentCount'
  | 'RPM'
  | 'SessionFlags'
  | 'SessionLapsRemainEx'
  | 'SessionNum'
  | 'SessionTick'
  | 'SessionTime'
  | 'SessionTimeRemain'
  | 'Speed'
  | 'Throttle'
  | 'TrackTempCrew'
  | `${'LF' | 'RF' | 'LR' | 'RR'}${'wearL' | 'wearM' | 'wearR' | 'tempCL' | 'tempCM' | 'tempCR'}`

// Optional: which variables exist depends on car and session.
export type TelemetryVarList = { [K in BoolVarName]?: TelemetryVariable<boolean> } & {
  [K in NumberVarName]?: TelemetryVariable<number>
}

// Session YAML. Types say what the YAML parser can really return, not what iRacing means.

export interface Driver {
  CarIdx: number
  UserName: string
  UserID: number
  TeamName: string
  CarNumber: string
  CarID: number
  CarScreenName: string
  CarClassID: number
  CarClassShortName: string
  CarClassColor: number
  CarClassEstLapTime: number
  CarIsPaceCar: number
  IsSpectator: number
  IRating: number
  LicString: string
  LicColor: number
  CurDriverIncidentCount: number
  FlairName?: string
}

export interface DriverInfo {
  DriverCarIdx: number
  DriverCarIdleRPM: number
  DriverCarSLFirstRPM: number
  DriverCarSLShiftRPM: number
  DriverCarSLLastRPM: number
  DriverCarSLBlinkRPM: number
  DriverCarFuelMaxLtr: number
  DriverCarMaxFuelPct: number
  Drivers: Driver[]
}

export interface WeekendInfo {
  TrackID: number
  TrackDisplayName: string
  // e.g. "5.79 km"
  TrackLength: string
  WeekendOptions?: {
    // e.g. "17x" or "unlimited". A bare number comes back as number.
    IncidentLimit?: string | number
  }
}

export interface SessionResultsPosition {
  CarIdx: number
  Position: number
  LapsComplete: number
  FastestTime: number
  LastTime: number
}

export interface SessionInfo {
  SessionNum: number
  SessionType: string
  SessionTrackRubberState?: string
  ResultsPositions?: SessionResultsPosition[] | null
}

export interface SessionList {
  Sessions: SessionInfo[]
}
