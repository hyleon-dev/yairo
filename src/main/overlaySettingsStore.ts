import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { DEFAULT_OVERLAY_SETTINGS, type AnyOverlaySettings, type OverlayId } from '../shared/types'

// Every overlay gets its own JSON file under
// userData/overlay-settings/<id>.json
// keeps settings per overlay independently
// organized instead of one shared, 'large' file.
export class OverlaySettingsStore {
  private dir: string
  private cache = new Map<OverlayId, AnyOverlaySettings>()

  constructor() {
    this.dir = join(app.getPath('userData'), 'overlay-settings')
  }

  get(id: OverlayId): AnyOverlaySettings {
    const cached = this.cache.get(id)
    if (cached) return cached

    const loaded = this.load(id)
    this.cache.set(id, loaded)
    return loaded
  }

  // Merges the patch (new option-state) into the current settings
  set(id: OverlayId, patch: Partial<AnyOverlaySettings>): AnyOverlaySettings {
    const updated = { ...this.get(id), ...patch } as AnyOverlaySettings
    this.cache.set(id, updated)
    this.persist(id, updated)
    return updated
  }

  private filePath(id: OverlayId): string {
    return join(this.dir, `${id}.json`)
  }

  private load(id: OverlayId): AnyOverlaySettings {
    const defaults = DEFAULT_OVERLAY_SETTINGS[id]
    try {
      const file = this.filePath(id)
      if (existsSync(file)) {
        const saved = JSON.parse(readFileSync(file, 'utf-8'))
        return { ...defaults, ...saved }
      }
    } catch (err) {
      console.error(`Failed to load settings for overlay "${id}", using defaults:`, err)
    }
    return defaults
  }

  private persist(id: OverlayId, settings: AnyOverlaySettings): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.filePath(id), JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err) {
      console.error(`Failed to save settings for overlay "${id}":`, err)
    }
  }
}
