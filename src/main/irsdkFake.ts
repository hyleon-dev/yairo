import type { Driver, DriverInfo, SessionList, TelemetryVariable, TelemetryVarList, WeekendInfo } from 'irsdk-node'
import { FLAG_BITS } from '../shared/types'

// Simulated race session for local dev without iRacing running (see
// "npm run dev:mock", IRSDK_MOCK=1 in irsdkWorker.ts). Mirrors only the SDK
// fields irsdkWorker.ts actually reads - everything else on
// TelemetryVarList/DriverInfo/WeekendInfo/SessionList stays unfilled, hence
// the "as unknown as" casts below. Kept simple on purpose (no pit stops, no
// session changes, no spectating - always in your own car).

const TRACK_ID = 239 // Autodromo Nazionale Monza (GP layout), see trackmaps/data.json
const TRACK_LENGTH_M = 5793
const SESSION_DURATION_SEC = 30 * 60
const PLAYER_CAR_IDX = 0

const AVG_SPEED_MPS = 45 // ~162 km/h avg, plausible for a GT3

const RPM_IDLE = 1000
const RPM_SL_FIRST = 5000
const RPM_SL_SHIFT = 6500
const RPM_SL_LAST = 7200
const RPM_SL_BLINK = 7500

const DRIVER_NAMES = [
  'Alex Nguyen',
  'Jonas Keller',
  'Elena Rossi',
  'Tom Bergström',
  "Liam O'Connor",
  'Nina Kowalski',
  'Marco Bianchi',
  'Sven Lindqvist',
  'Ana Ferreira',
  'Chris Wagner',
  'Yuki Tanaka',
  'Paul Dubois',
  'Erik Johansson',
  'Sofia Novak',
  'Ben Harris',
  'Mia Schulz'
]

// Cycles through the flags every FLAG_CYCLE_INTERVAL_SEC seconds.
const FLAG_CYCLE = [
  0,
  FLAG_BITS.green,
  FLAG_BITS.yellow,
  FLAG_BITS.yellowWaving,
  FLAG_BITS.blue,
  FLAG_BITS.white,
  FLAG_BITS.checkered,
  FLAG_BITS.black,
  FLAG_BITS.repair,
  FLAG_BITS.caution,
  FLAG_BITS.cautionWaving
]
const FLAG_CYCLE_INTERVAL_SEC = 6

interface FakeDriverState {
  carIdx: number
  custId: number
  name: string
  carNumber: string
  iRating: number
  licString: string
  licColor: number
  basePaceSec: number
  currentLapPaceSec: number
  lapDistPct: number
  lapsCompleted: number
  lastLapTime: number
  bestLapTime: number
}

// generate safety rating based on iRating
function licInfoFor(iRating: number): { licString: string; licColor: number } {
  if (iRating > 3000) return { licString: 'A 3.50', licColor: 0x1c4fd6 } // blue
  if (iRating > 2000) return { licString: 'B 2.80', licColor: 0x1fa62e } // green
  if (iRating > 1350) return { licString: 'C 2.10', licColor: 0xe6c229 } // yellow
  return { licString: 'D 1.50', licColor: 0xe6842a } // orange
}

function createDrivers(): FakeDriverState[] {
  return DRIVER_NAMES.map((name, carIdx) => {
    const iRating = 1500 + Math.round(Math.random() * 2500)
    const licInfo = licInfoFor(iRating)
    // pace difference based on grid position
    // short lap time for faster data changes
    const basePaceSec = 22 + carIdx * 0.35
    return {
      carIdx,
      custId: 900000 + carIdx,
      name,
      carNumber: String(carIdx + 1),
      iRating,
      licString: licInfo.licString,
      licColor: licInfo.licColor,
      basePaceSec,
      currentLapPaceSec: basePaceSec,
      lapDistPct: Math.random() * 0.05, // start offset instead of side-by-side
      lapsCompleted: 0,
      lastLapTime: -1,
      bestLapTime: -1
    }
  })
}

function scalarVar<T>(value: T, unit = ''): TelemetryVariable<T[]> {
  return { name: '', description: '', unit, countAsTime: false, length: 1, varType: 4, value: [value] }
}

function arrayVar<T>(value: T[], unit = ''): TelemetryVariable<T[]> {
  return { name: '', description: '', unit, countAsTime: false, length: value.length, varType: 4, value }
}

export class FakeIRacingSDK {
  private drivers = createDrivers()
  private simTimeSec = 0
  private lastTickAt = Date.now()
  private fuelLevel = 65 // L, typical GT3 tank
  private readonly fuelTankMaxL = 65
  private tireWearPct = 100 // simplified: same wear across all 3 zones per corner

  startSDK(): boolean {
    console.log('[irsdk-fake] fake SDK started - simulating a practice/race session at Monza')
    return true
  }

  // Timeouts so the fake runs at the same rate (~30Hz) as a real connect,
  // otherwise the setImmediate() loop in irsdkWorker.ts would spin unthrottled
  // and flood the main process with messages.
  waitForData(timeoutMs = 16): boolean {
    const elapsed = Date.now() - this.lastTickAt
    const remaining = timeoutMs - elapsed
    if (remaining > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, remaining)
    }

    const now = Date.now()
    const dtSec = (now - this.lastTickAt) / 1000
    this.lastTickAt = now
    this.advance(dtSec)
    return true
  }

  private advance(dtSec: number): void {
    this.simTimeSec += dtSec

    const player = this.drivers[PLAYER_CAR_IDX]
    const fuelBurnPerSec = 2.6 / player.basePaceSec // target: ~2.6 L/lap
    this.fuelLevel = Math.max(0, this.fuelLevel - fuelBurnPerSec * dtSec)
    // Down to 0% (flat) within a few minutes, so the Tires overlay quickly cycles through
    // its whole color range (green -> yellow -> dark -> flat/black) while testing.
    const TIRE_WEAR_ZERO_AT_SEC = 240
    this.tireWearPct = Math.max(0, 100 - (this.simTimeSec / TIRE_WEAR_ZERO_AT_SEC) * 100)

    for (const driver of this.drivers) {
      driver.lapDistPct += dtSec / driver.currentLapPaceSec
      if (driver.lapDistPct >= 1) {
        driver.lapDistPct -= 1
        driver.lapsCompleted += 1
        driver.lastLapTime = driver.currentLapPaceSec
        if (driver.bestLapTime < 0 || driver.lastLapTime < driver.bestLapTime) {
          driver.bestLapTime = driver.lastLapTime
        }
        // Slightly faster/slower next lap for different lap times
        driver.currentLapPaceSec = driver.basePaceSec + (Math.random() - 0.5) * 0.8
      }
    }
  }

  private computePositions(): number[] {
    const order = this.drivers
      .map((d) => ({ carIdx: d.carIdx, progress: d.lapsCompleted + d.lapDistPct }))
      .sort((a, b) => b.progress - a.progress)

    const positions = new Array<number>(this.drivers.length)
    order.forEach((entry, i) => {
      positions[entry.carIdx] = i + 1
    })
    return positions
  }

  private computeGapsToLeader(): number[] {
    const leaderProgress = Math.max(...this.drivers.map((d) => d.lapsCompleted + d.lapDistPct))
    return this.drivers.map((d) => (leaderProgress - (d.lapsCompleted + d.lapDistPct)) * d.basePaceSec)
  }

  getTelemetry(): TelemetryVarList {
    const player = this.drivers[PLAYER_CAR_IDX]

    // variations for speed, RPM and gear so it doesn't look constant, but like corners/straights
    const speedMps = Math.max(15, AVG_SPEED_MPS * (0.55 + 0.45 * Math.sin(player.lapDistPct * Math.PI * 10)))
    const gear = Math.min(6, Math.max(1, Math.floor(speedMps / 12) + 1))
    const revPhase = (player.lapDistPct * 10) % 1
    const rpm = RPM_IDLE + revPhase * (RPM_SL_BLINK + 500 - RPM_IDLE)
    const accelerating = Math.cos(player.lapDistPct * Math.PI * 10) > 0
    const clutchEngaged = revPhase < 0.06 ? 0.1 : 1

    const positions = this.computePositions()
    const currentLapTime = player.lapDistPct * player.currentLapPaceSec

    const tireWearFrac = this.tireWearPct / 100 // SDK gives 0..1 despite its "%" unit label
    // Front tires run a bit hotter than rear, varies slightly with track position - just for visual variety.
    const baseTireTemp = 75 + 15 * Math.sin(player.lapDistPct * Math.PI * 4)

    const raw: Record<string, TelemetryVariable<unknown>> = {
      SessionTime: scalarVar(this.simTimeSec, 's'),
      SessionTimeRemain: scalarVar(Math.max(0, SESSION_DURATION_SEC - this.simTimeSec), 's'),
      SessionNum: scalarVar(0),
      AirTemp: scalarVar(21, 'C'),
      TrackTempCrew: scalarVar(28, 'C'),

      IsOnTrack: scalarVar(true),
      // Fake driver never pits, matches CarIdxTrackSurface's own
      // "always on track" simplification below.
      OnPitRoad: scalarVar(false),
      PlayerCarIdx: scalarVar(PLAYER_CAR_IDX),
      CamCarIdx: scalarVar(PLAYER_CAR_IDX),
      PlayerCarPosition: scalarVar(positions[PLAYER_CAR_IDX]),
      PlayerCarMyIncidentCount: scalarVar(0),

      Speed: scalarVar(speedMps),
      RPM: scalarVar(rpm),
      Gear: scalarVar(gear),
      Throttle: scalarVar(accelerating ? 0.85 : 0.1),
      Brake: scalarVar(accelerating ? 0 : 0.5),
      Clutch: scalarVar(clutchEngaged),
      FuelLevel: scalarVar(this.fuelLevel),
      // Fixed "top off to full" plan, so the Fuel overlay's next-fill display
      // has a non-empty value to show in dev mode.
      PitSvFuel: scalarVar(Math.max(0, this.fuelTankMaxL - this.fuelLevel)),
      Lap: scalarVar(player.lapsCompleted + 1),
      LapDistPct: scalarVar(player.lapDistPct),
      LapCurrentLapTime: scalarVar(currentLapTime),
      LapLastLapTime: scalarVar(player.lastLapTime),
      LapBestLapTime: scalarVar(player.bestLapTime),
      LapDeltaToBestLap: scalarVar(player.bestLapTime > 0 ? player.lastLapTime - player.bestLapTime : 0),
      // Real iRacing only flags this valid once a reference lap exists AND
      // at least one lap has been driven against it - mocked here as "a best
      // lap exists and this isn't the lap that just set it".
      LapDeltaToBestLap_OK: scalarVar(player.bestLapTime > 0 && player.lapsCompleted > 0),

      CarIdxLapDistPct: arrayVar(this.drivers.map((d) => d.lapDistPct)),
      CarIdxLap: arrayVar(this.drivers.map((d) => d.lapsCompleted + 1)),
      CarIdxLapCompleted: arrayVar(this.drivers.map((d) => d.lapsCompleted)),
      CarIdxLastLapTime: arrayVar(this.drivers.map((d) => d.lastLapTime)),
      CarIdxBestLapTime: arrayVar(this.drivers.map((d) => d.bestLapTime)),
      CarIdxEstTime: arrayVar(this.drivers.map((d) => d.lapDistPct * d.currentLapPaceSec)),
      CarIdxTrackSurface: arrayVar(this.drivers.map(() => 3)), // always "on track", no pit stops
      CarIdxRPM: arrayVar(this.drivers.map((d, i) => (i === PLAYER_CAR_IDX ? rpm : 6000))),
      CarIdxGear: arrayVar(this.drivers.map((d, i) => (i === PLAYER_CAR_IDX ? gear : 4))),
      CarIdxPosition: arrayVar(positions),
      CarIdxF2Time: arrayVar(this.computeGapsToLeader()),
      SessionFlags: scalarVar(FLAG_CYCLE[Math.floor(this.simTimeSec / FLAG_CYCLE_INTERVAL_SEC) % FLAG_CYCLE.length]),

      LFwearL: scalarVar(tireWearFrac),
      LFwearM: scalarVar(tireWearFrac),
      LFwearR: scalarVar(tireWearFrac),
      RFwearL: scalarVar(tireWearFrac),
      RFwearM: scalarVar(tireWearFrac),
      RFwearR: scalarVar(tireWearFrac),
      LRwearL: scalarVar(tireWearFrac),
      LRwearM: scalarVar(tireWearFrac),
      LRwearR: scalarVar(tireWearFrac),
      RRwearL: scalarVar(tireWearFrac),
      RRwearM: scalarVar(tireWearFrac),
      RRwearR: scalarVar(tireWearFrac),

      LFtempCL: scalarVar(baseTireTemp + 4),
      LFtempCM: scalarVar(baseTireTemp + 6),
      LFtempCR: scalarVar(baseTireTemp + 5),
      RFtempCL: scalarVar(baseTireTemp + 7),
      RFtempCM: scalarVar(baseTireTemp + 9),
      RFtempCR: scalarVar(baseTireTemp + 8),
      LRtempCL: scalarVar(baseTireTemp - 6),
      LRtempCM: scalarVar(baseTireTemp - 4),
      LRtempCR: scalarVar(baseTireTemp - 5),
      RRtempCL: scalarVar(baseTireTemp - 3),
      RRtempCM: scalarVar(baseTireTemp - 1),
      RRtempCR: scalarVar(baseTireTemp - 2)
    }

    return raw as unknown as TelemetryVarList
  }

  getDriverInfo(): DriverInfo | null {
    const drivers: Partial<Driver>[] = this.drivers.map((d) => ({
      CarIdx: d.carIdx,
      UserName: d.name,
      UserID: d.custId,
      CarNumber: d.carNumber,
      CarClassID: 1,
      CarClassColor: 0x8e44ad,
      CarID: 1,
      CarIsPaceCar: 0,
      CarScreenName: 'Fake GT3',
      CarClassShortName: 'GT3',
      CarClassEstLapTime: d.basePaceSec,
      IRating: d.iRating,
      LicString: d.licString,
      LicColor: d.licColor,
      IsSpectator: 0,
      CurDriverIncidentCount: 0
    }))

    return {
      DriverCarIdx: PLAYER_CAR_IDX,
      DriverCarIdleRPM: RPM_IDLE,
      DriverCarSLFirstRPM: RPM_SL_FIRST,
      DriverCarSLShiftRPM: RPM_SL_SHIFT,
      DriverCarSLLastRPM: RPM_SL_LAST,
      DriverCarSLBlinkRPM: RPM_SL_BLINK,
      DriverCarFuelMaxLtr: this.fuelTankMaxL,
      DriverCarMaxFuelPct: 0, // unrestricted, matches "no event fuel-load rule"
      Drivers: drivers
    } as unknown as DriverInfo
  }

  getWeekendInfo(): WeekendInfo | null {
    return {
      TrackID: TRACK_ID,
      TrackDisplayName: 'Autodromo Nazionale Monza (Fake)',
      TrackLength: `${(TRACK_LENGTH_M / 1000).toFixed(2)} km`
    } as unknown as WeekendInfo
  }

  getSessionInfo(): SessionList | null {
    return {
      Sessions: [
        {
          SessionNum: 0,
          SessionType: 'Race',
          SessionTrackRubberState: 'Optimum Dry',
          ResultsPositions: []
        }
      ]
    } as unknown as SessionList
  }
}
