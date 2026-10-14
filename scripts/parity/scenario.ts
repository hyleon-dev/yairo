import { advanceClock } from './patch'
import { FakeIRacingSDK } from '../../src/main/sim/iracing/irsdkFake'

export const FRAMES = 3000
const FRAME_MS = 250

// Wraps the fake SDK to also cover spectating, non-race sessions and official-results fallbacks.
export class ScenarioSdk {
  private fake = new FakeIRacingSDK()
  frame = 0

  startSDK(): boolean {
    return true
  }

  waitForData(): boolean {
    this.frame++
    advanceClock(FRAME_MS)
    return this.fake.waitForData(1)
  }

  getTelemetry(): any {
    const raw: any = this.fake.getTelemetry()
    const f = this.frame
    if (f >= 600 && f < 900) {
      raw.IsOnTrack = { ...raw.IsOnTrack, value: [false] }
      raw.CamCarIdx = { ...raw.CamCarIdx, value: [3] }
    }
    if (f >= 900 && f < 1000) {
      raw.IsOnTrack = { ...raw.IsOnTrack, value: [false] }
      raw.CamCarIdx = { ...raw.CamCarIdx, value: [-1] }
    }
    if (f >= 1200 && f < 1300) {
      // own car not yet classified, falls back to PlayerCarPosition
      const pos = [...raw.CarIdxPosition.value]
      pos[0] = 0
      raw.CarIdxPosition = { ...raw.CarIdxPosition, value: pos }
    }
    return raw
  }

  getDriverInfo(): any {
    const info: any = this.fake.getDriverInfo()
    if (this.frame >= 1500 && this.frame < 1700 && info) {
      // driver 5 turns spectator (left the car), stays in results
      return { ...info, Drivers: info.Drivers.map((d: any) => (d.CarIdx === 5 ? { ...d, IsSpectator: 1 } : d)) }
    }
    return info
  }

  getWeekendInfo(): any {
    return this.fake.getWeekendInfo()
  }

  getSessionInfo(): any {
    const info: any = this.fake.getSessionInfo()
    if (!info) return info
    const f = this.frame
    const sessions = info.Sessions.map((s: any) => {
      let next = { ...s }
      if (f >= 1400 && f < 1800) {
        next.ResultsPositions = [
          { CarIdx: 5, Position: 2, LapsComplete: 3, FastestTime: 101.5, LastTime: 103.2 },
          { CarIdx: 40, Position: 1, LapsComplete: 2, FastestTime: 99.9, LastTime: 104.0 }
        ]
      }
      if (f >= 2200) next = { ...next, SessionType: 'Practice', SessionNum: next.SessionNum }
      return next
    })
    return { ...info, Sessions: sessions }
  }
}
