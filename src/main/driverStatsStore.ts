import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { DriverLapTimeEntry, DriverRecord, DriverStatsData } from '../shared/types'

// Persists driver data, keyed by iRacing CustID.
// Unlike overlaySettingsStore.ts, this uses ONE file for everything.
//
// Lifetime: the data must apply only to the CURRENT iRacing session. It must not build up across sessions.
// iRating and Safety Rating from three weeks ago are not a useful comparison anymore.
// But a long endurance race must NOT lose its data on app close or a server disconnect.
// Instead, the data gets an expiry timestamp (`sessionExpiresAt`). This timestamp keeps moving
// forward while telemetry is live, based on the remaining session time.
// The app checks this timestamp only on the next (re)connect or app start.
// If the timestamp has passed, the old session is outdated and its history gets deleted.

const GRACE_PERIOD_MS = 30 * 60 * 1000 // buffer after the computed session end

interface DriverStatsFile {
  // Epoch ms after which the history counts as an "old session"
  // and gets deleted on the next load.
  // null = never set (fresh store or just cleared).
  sessionExpiresAt: number | null
  drivers: DriverStatsData
}

const EMPTY_FILE: DriverStatsFile = { sessionExpiresAt: null, drivers: {} }

export class DriverStatsStore {
  private filePath: string
  private file: DriverStatsFile

  constructor() {
    this.filePath = join(app.getPath('userData'), 'driver-stats.json')
    this.file = this.load()
    this.expireIfStale()
  }

  getAll(): DriverStatsData {
    return this.file.drivers
  }

  getDriver(custId: number): DriverRecord | undefined {
    return this.file.drivers[custId]
  }

  recordLapTime(custId: number, driverName: string, entry: DriverLapTimeEntry): void {
    const existing = this.file.drivers[custId]
    const record: DriverRecord = existing
      ? { ...existing, driverName, lapTimes: [...existing.lapTimes, entry] }
      : { custId, driverName, lapTimes: [entry] }

    this.file = { ...this.file, drivers: { ...this.file.drivers, [custId]: record } }
    this.persist()
  }

  // Called repeatedly (not just once) so extending the session doesn't lose data.
  updateSessionExpiry(sessionTimeRemainSec: number): void {
    const expiresAt = Date.now() + Math.max(0, sessionTimeRemainSec) * 1000 + GRACE_PERIOD_MS
    this.file = { ...this.file, sessionExpiresAt: expiresAt }
    this.persist()
  }

  expireIfStale(): void {
    const { sessionExpiresAt } = this.file
    if (sessionExpiresAt !== null && Date.now() > sessionExpiresAt) {
      this.file = { sessionExpiresAt: null, drivers: {} }
      this.persist()
    }
  }

  private load(): DriverStatsFile {
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Partial<DriverStatsFile>
        return { sessionExpiresAt: parsed.sessionExpiresAt ?? null, drivers: parsed.drivers ?? {} }
      }
    } catch (err) {
      console.error('Failed to load driver-stats.json, starting empty:', err)
    }
    return EMPTY_FILE
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.file, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save driver-stats.json:', err)
    }
  }
}
