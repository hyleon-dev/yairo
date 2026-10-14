import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_COLOR_CORRECTION_MODE,
  DEFAULT_SIMULATOR,
  SIMULATOR_IDS,
  type AppConfig,
  type ColorCorrectionMode,
  type OverlayConfig,
  type SimulatorId
} from '../shared/types'

const DEFAULT_CONFIG: AppConfig = {
  editMode: false,
  controlWindowBounds: null,
  accentColor: DEFAULT_ACCENT_COLOR,
  colorCorrectionMode: DEFAULT_COLOR_CORRECTION_MODE,
  targetLapTimeSec: 0,
  simulator: DEFAULT_SIMULATOR,
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
    },
    {
      id: 'tires',
      name: 'Tires',
      enabled: false,
      bounds: { x: 100, y: 650, width: 220, height: 200 }
    },
    {
      id: 'flags',
      name: 'Flags',
      enabled: false,
      bounds: { x: 1000, y: 100, width: 200, height: 200 }
    },
    {
      id: 'delta-bar',
      name: 'Delta Bar',
      enabled: false,
      bounds: { x: 960, y: 10, width: 280, height: 50 }
    },
    {
      id: 'damage',
      name: 'Damage',
      enabled: false,
      bounds: { x: 1220, y: 100, width: 160, height: 220 }
    }
  ]
}

// Merges saved overlays into DEFAULT_CONFIG by id, not by replacing the whole array.
// This way a newly added overlay still appears in existing config.json files.
function mergeOverlays(saved: OverlayConfig[] | undefined): OverlayConfig[] {
  const savedById = new Map((saved ?? []).map((o) => [o.id, o]))
  return DEFAULT_CONFIG.overlays.map((def) => {
    const existing = savedById.get(def.id)
    return existing ? { ...def, ...existing } : def
  })
}

// What config.json holds. Overlay layout and target lap time are kept per simulator,
// AppConfig only exposes the active simulator's values.
interface StoredConfig extends Omit<AppConfig, 'overlays' | 'targetLapTimeSec'> {
  overlaysBySim: Record<SimulatorId, OverlayConfig[]>
  targetLapTimeSecBySim: Record<SimulatorId, number>
}

function perSim<T>(value: (sim: SimulatorId) => T): Record<SimulatorId, T> {
  return Object.fromEntries(SIMULATOR_IDS.map((sim) => [sim, value(sim)])) as Record<SimulatorId, T>
}

const DEFAULT_STORED: StoredConfig = {
  editMode: DEFAULT_CONFIG.editMode,
  controlWindowBounds: DEFAULT_CONFIG.controlWindowBounds,
  accentColor: DEFAULT_CONFIG.accentColor,
  colorCorrectionMode: DEFAULT_CONFIG.colorCorrectionMode,
  simulator: DEFAULT_CONFIG.simulator,
  overlaysBySim: perSim(() => DEFAULT_CONFIG.overlays),
  targetLapTimeSecBySim: perSim(() => DEFAULT_CONFIG.targetLapTimeSec)
}

export class ConfigStore {
  private filePath: string
  private stored: StoredConfig

  constructor() {
    this.filePath = join(app.getPath('userData'), 'config.json')
    this.stored = this.load()
    // Writes an older file in the new per-simulator format right away.
    if (existsSync(this.filePath)) this.persist()
  }

  get(): AppConfig {
    const { overlaysBySim, targetLapTimeSecBySim, ...global } = this.stored
    return {
      ...global,
      overlays: overlaysBySim[global.simulator],
      targetLapTimeSec: targetLapTimeSecBySim[global.simulator]
    }
  }

  setOverlay(id: string, patch: Partial<OverlayConfig>): AppConfig {
    const { simulator, overlaysBySim } = this.stored
    const overlays = overlaysBySim[simulator].map((o) => (o.id === id ? { ...o, ...patch } : o))
    return this.update({ overlaysBySim: { ...overlaysBySim, [simulator]: overlays } })
  }

  setEditMode(editMode: boolean): AppConfig {
    return this.update({ editMode })
  }

  setControlWindowBounds(bounds: OverlayConfig['bounds']): AppConfig {
    return this.update({ controlWindowBounds: bounds })
  }

  setAccentColor(accentColor: string): AppConfig {
    return this.update({ accentColor })
  }

  setColorCorrectionMode(colorCorrectionMode: ColorCorrectionMode): AppConfig {
    return this.update({ colorCorrectionMode })
  }

  setTargetLapTimeSec(targetLapTimeSec: number): AppConfig {
    const { simulator, targetLapTimeSecBySim } = this.stored
    return this.update({ targetLapTimeSecBySim: { ...targetLapTimeSecBySim, [simulator]: targetLapTimeSec } })
  }

  setSimulator(simulator: SimulatorId): AppConfig {
    return this.update({ simulator })
  }

  private update(patch: Partial<StoredConfig>): AppConfig {
    this.stored = { ...this.stored, ...patch }
    this.persist()
    return this.get()
  }

  private load(): StoredConfig {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        // Older files have a single overlays/targetLapTimeSec. Both sims start from those.
        const saved = JSON.parse(raw) as Partial<StoredConfig> & Partial<Pick<AppConfig, 'overlays' | 'targetLapTimeSec'>>
        return {
          editMode: saved.editMode ?? DEFAULT_STORED.editMode,
          controlWindowBounds: saved.controlWindowBounds ?? DEFAULT_STORED.controlWindowBounds,
          accentColor: saved.accentColor ?? DEFAULT_STORED.accentColor,
          colorCorrectionMode: saved.colorCorrectionMode ?? DEFAULT_STORED.colorCorrectionMode,
          simulator:
            saved.simulator && SIMULATOR_IDS.includes(saved.simulator) ? saved.simulator : DEFAULT_STORED.simulator,
          overlaysBySim: perSim((sim) => mergeOverlays(saved.overlaysBySim?.[sim] ?? saved.overlays)),
          targetLapTimeSecBySim: perSim(
            (sim) => saved.targetLapTimeSecBySim?.[sim] ?? saved.targetLapTimeSec ?? DEFAULT_CONFIG.targetLapTimeSec
          )
        }
      }
    } catch (err) {
      console.error('Could not load config.json, using defaults:', err)
    }
    return DEFAULT_STORED
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(this.stored, null, 2), 'utf-8')
    } catch (err) {
      console.error('Could not save config.json:', err)
    }
  }
}
