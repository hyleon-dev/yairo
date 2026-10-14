import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_OVERLAY_SETTINGS,
  SIMULATOR_IDS,
  type AnyOverlaySettings,
  type OverlayId,
  type SimulatorId
} from '../shared/types'

// One JSON file per simulator and overlay under userData/overlay-settings/<sim>/<id>.json.
export class OverlaySettingsStore {
  private dir: string
  private cache = new Map<string, AnyOverlaySettings>()

  constructor(private simulator: SimulatorId) {
    this.dir = join(app.getPath('userData'), 'overlay-settings')
    this.migrateLegacyFiles()
  }

  // Older versions kept one file per overlay directly in overlay-settings/. Copied to
  // every simulator that has no own file yet. The old files stay for a downgrade.
  private migrateLegacyFiles(): void {
    try {
      if (!existsSync(this.dir)) return
      const legacyFiles = readdirSync(this.dir, { withFileTypes: true }).filter(
        (entry) => entry.isFile() && entry.name.endsWith('.json')
      )
      for (const sim of SIMULATOR_IDS) {
        const simDir = join(this.dir, sim)
        mkdirSync(simDir, { recursive: true })
        for (const { name } of legacyFiles) {
          const target = join(simDir, name)
          if (!existsSync(target)) copyFileSync(join(this.dir, name), target)
        }
      }
    } catch (err) {
      console.error('Failed to migrate old overlay settings:', err)
    }
  }

  setSimulator(simulator: SimulatorId): void {
    this.simulator = simulator
  }

  get(id: OverlayId): AnyOverlaySettings {
    const key = this.cacheKey(id)
    const cached = this.cache.get(key)
    if (cached) return cached

    const loaded = this.load(id)
    this.cache.set(key, loaded)
    return loaded
  }

  set(id: OverlayId, patch: Partial<AnyOverlaySettings>): AnyOverlaySettings {
    const updated = { ...this.get(id), ...patch } as AnyOverlaySettings
    this.cache.set(this.cacheKey(id), updated)
    this.persist(id, updated)
    return updated
  }

  private cacheKey(id: OverlayId): string {
    return `${this.simulator}/${id}`
  }

  private simDir(): string {
    return join(this.dir, this.simulator)
  }

  private load(id: OverlayId): AnyOverlaySettings {
    const defaults = DEFAULT_OVERLAY_SETTINGS[id]
    try {
      const file = join(this.simDir(), `${id}.json`)
      if (existsSync(file)) return { ...defaults, ...JSON.parse(readFileSync(file, 'utf-8')) }
    } catch (err) {
      console.error(`Failed to load settings for overlay "${id}", using defaults:`, err)
    }
    return defaults
  }

  private persist(id: OverlayId, settings: AnyOverlaySettings): void {
    try {
      mkdirSync(this.simDir(), { recursive: true })
      writeFileSync(join(this.simDir(), `${id}.json`), JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err) {
      console.error(`Failed to save settings for overlay "${id}":`, err)
    }
  }
}
