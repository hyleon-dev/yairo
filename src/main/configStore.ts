import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { AppConfig, OverlayConfig } from '../shared/types'

const DEFAULT_CONFIG: AppConfig = {
  editMode: false,
  overlays: [
    {
      id: 'telemetry',
      name: 'Telemetry',
      enabled: true,
      bounds: { x: 100, y: 100, width: 320, height: 150 }
    },
    {
      id: 'fuel',
      name: 'Fuel',
      enabled: false,
      bounds: { x: 650, y: 100, width: 180, height: 100 }
    },
    {
      id: 'lap-timer',
      name: 'Lap Timer',
      enabled: false,
      bounds: { x: 100, y: 320, width: 220, height: 170 }
    },
    {
      id: 'incidents',
      name: 'Incidents',
      enabled: false,
      bounds: { x: 100, y: 500, width: 220, height: 110 }
    },
    {
      id: 'standings',
      name: 'Standings',
      enabled: false,
      bounds: { x: 400, y: 320, width: 360, height: 460 }
    },
    {
      id: 'relative',
      name: 'Relative',
      enabled: false,
      bounds: { x: 780, y: 320, width: 300, height: 260 }
    },
    {
      id: 'trackmap',
      name: 'Track Map',
      enabled: false,
      bounds: { x: 780, y: 600, width: 360, height: 202 }
    }
  ]
}

// Merges saved array into DEFAULT_CONFIG per overlay id instead
// of replacing it wholesale; otherwise a newly added overlay would
// never show up for existing config.json files, since their "overlays"
// array would replace the default array on spread instead of extending it.
function mergeOverlays(saved: OverlayConfig[] | undefined): OverlayConfig[] {
  const savedById = new Map((saved ?? []).map((o) => [o.id, o]))
  return DEFAULT_CONFIG.overlays.map((def) => {
    const existing = savedById.get(def.id)
    return existing ? { ...def, ...existing } : def
  })
}

export class ConfigStore {
  private filePath: string
  private config: AppConfig

  constructor() {
    this.filePath = join(app.getPath('userData'), 'config.json')
    this.config = this.load()
  }

  get(): AppConfig {
    return this.config
  }

  setOverlay(id: string, patch: Partial<OverlayConfig>): AppConfig {
    this.config = {
      ...this.config,
      overlays: this.config.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o))
    }
    this.persist()
    return this.config
  }

  setEditMode(editMode: boolean): AppConfig {
    this.config = { ...this.config, editMode }
    this.persist()
    return this.config
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        const saved = JSON.parse(raw) as Partial<AppConfig>
        return {
          editMode: saved.editMode ?? DEFAULT_CONFIG.editMode,
          overlays: mergeOverlays(saved.overlays)
        }
      }
    } catch (err) {
      console.error('Could not load config.json, using defaults:', err)
    }
    return DEFAULT_CONFIG
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (err) {
      console.error('Could not save config.json:', err)
    }
  }
}
