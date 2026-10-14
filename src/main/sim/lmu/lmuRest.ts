import type { TrackShape } from '../../../shared/types'

// LMU's local REST API (the game menu's web server). Only reachable on the same PC.
// After some LMU updates only IPv6 answered, so both loopback addresses are tried.
const BASES = ['http://127.0.0.1:6397', 'http://[::1]:6397']
const REQUEST_TIMEOUT_MS = 1000
const FOCUS_POLL_MS = 500
const CAR_NUMBER_POLL_MS = 2000
const PIT_MENU_POLL_MS = 2000
// The vehicle list is ~600 KB.
const VEHICLES_TIMEOUT_MS = 5000
const NATIONALITY_RETRY_MS = 10_000
const TRACK_SHAPE_TIMEOUT_MS = 5000
const TRACK_SHAPE_RETRY_MS = 5000
// The track line is about 1-2 % shorter than the official length. A bigger difference
// means REST still returns the map of the previous layout.
const TRACK_LENGTH_TOLERANCE = 0.1
const TRACK_SHAPE_PADDING_M = 15
const SESSION_CHECK_MS = 2000
// One failed request (e.g. a timeout under load) should not hide the map.
const SESSION_CHECK_MISSES = 2
const OVERLAY_ASPECT = 16 / 9
const ROTATION_STEP_DEG = 5
// Keeps the unrotated (north-up) map unless a rotation is clearly bigger.
const MIN_ROTATION_GAIN = 0.05

let preferredBase = BASES[0]

async function getJson(route: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  for (const base of [preferredBase, ...BASES.filter((b) => b !== preferredBase)]) {
    try {
      const res = await fetch(base + route, { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) continue
      preferredBase = base
      return await res.json()
    } catch {
      // try next address
    }
  }
  return undefined
}

export async function isRestReachable(): Promise<boolean> {
  return (await getJson('/rest/watch/focus')) !== undefined
}

// Car (slot ID = mID) the camera follows. -1 if unknown.
export class LmuFocusPoller {
  focusCarId = -1
  private timer: NodeJS.Timeout | null = null
  private busy = false

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), FOCUS_POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.focusCarId = -1
  }

  private async poll(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const value = await getJson('/rest/watch/focus')
      this.focusCarId = typeof value === 'number' ? value : -1
    } finally {
      this.busy = false
    }
  }
}

// Car numbers by slot ID (= mID). Custom team liveries all carry #397 in mVehicleName,
// only REST has the number the driver picked.
export class LmuCarNumbers {
  private bySlot = new Map<number, string>()
  private timer: NodeJS.Timeout | null = null
  private busy = false

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), CAR_NUMBER_POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.bySlot = new Map()
  }

  lookup(slotId: number): string | undefined {
    return this.bySlot.get(slotId)
  }

  private async poll(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const standings = await getJson('/rest/watch/standings')
      if (!Array.isArray(standings)) return
      const bySlot = new Map<number, string>()
      for (const entry of standings as { slotID?: unknown; carNumber?: unknown }[]) {
        if (typeof entry.slotID === 'number' && typeof entry.carNumber === 'string' && entry.carNumber) {
          bySlot.set(entry.slotID, entry.carNumber)
        }
      }
      this.bySlot = bySlot
    } finally {
      this.busy = false
    }
  }
}

interface RestPitMenuEntry {
  name?: string
  currentSetting?: number
  settings?: { text?: string }[]
}

// Pit menu of the own car. Answers "Invalid state" (no JSON) without a car.
export class LmuPitMenu {
  // VE level after the stop in %, e.g. "100% 32 laps". null for cars without VE.
  veTargetPct: number | null = null
  // s, from /rest/strategy/pitstop-estimate (sum of damage, fuel, tires, ... times).
  pitStopTimeSec: number | null = null
  private timer: NodeJS.Timeout | null = null
  private busy = false

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), PIT_MENU_POLL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.veTargetPct = null
    this.pitStopTimeSec = null
  }

  private async poll(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const [menu, estimate] = await Promise.all([
        getJson('/rest/garage/PitMenu/receivePitMenu'),
        getJson('/rest/strategy/pitstop-estimate')
      ])
      const total = (estimate as { total?: unknown } | null | undefined)?.total
      this.pitStopTimeSec = typeof total === 'number' ? total : null
      const entry = Array.isArray(menu)
        ? (menu as RestPitMenuEntry[]).find((e) => e.name === 'VIRTUAL ENERGY:')
        : undefined
      const text = entry?.settings?.[entry.currentSetting ?? -1]?.text
      const pct = text?.match(/^(\d+(?:\.\d+)?)%/)?.[1]
      this.veTargetPct = pct !== undefined ? Number(pct) : null
    } finally {
      this.busy = false
    }
  }
}

interface RestVehicle {
  id?: string
  drivers?: { name?: string; nationality?: string }[]
}

function isoCode(nationality: unknown): string | null {
  return typeof nationality === 'string' && /^[A-Za-z]{2}$/.test(nationality) ? nationality.toLowerCase() : null
}

// Driver nationalities. Shared memory has none, but each installed vehicle lists its
// real drivers. The player replaces one of them, so their own comes from the profile.
// Lowercase ISO-2 codes, null if unknown (e.g. human drivers online).
export class LmuNationalities {
  private byVehicleDriver = new Map<string, string>()
  private player: string | null = null
  private loaded = false
  private timer: NodeJS.Timeout | null = null

  start(): void {
    if (this.loaded || this.timer) return
    void this.load()
    this.timer = setInterval(() => void this.load(), NATIONALITY_RETRY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  lookup(vehFilename: string, driverName: string, isPlayer: boolean): string | null {
    if (isPlayer) return this.player
    return this.byVehicleDriver.get(`${vehFilename}|${driverName}`) ?? null
  }

  private async load(): Promise<void> {
    const [vehicles, profile] = await Promise.all([
      getJson('/rest/sessions/getAllVehicles', VEHICLES_TIMEOUT_MS),
      getJson('/rest/profile/profileInfo/getProfileInfo')
    ])
    if (!Array.isArray(vehicles) || this.loaded) return

    for (const vehicle of vehicles as RestVehicle[]) {
      for (const driver of vehicle.drivers ?? []) {
        const code = isoCode(driver.nationality)
        if (vehicle.id && driver.name && code) this.byVehicleDriver.set(`${vehicle.id}|${driver.name}`, code)
      }
    }
    this.player = isoCode((profile as { nationality?: unknown } | undefined)?.nationality)
    this.loaded = true
    this.stop()
  }
}

interface RestTrackPoint {
  type: number
  x: number
  z: number
}

const TRACK_POINT_TYPE_TRACK = 0
const TRACK_POINT_TYPE_PIT = 1

// World x/z to map coordinates. Without the flip on z the map is mirrored.
export function toMapPoint(x: number, z: number): { x: number; y: number } {
  return { x, y: -z }
}

function svgPath(points: { x: number; y: number }[], closed: boolean): string {
  if (points.length < 2) return ''
  const parts = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
  return parts.join('') + (closed ? 'Z' : '')
}

function pathLength(points: { x: number; y: number }[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  return length
}

// Angle (SVG rotate, degrees) at which the track fills the 16:9 overlay best, plus the
// rotated bounding box.
function bestRotation(points: { x: number; y: number }[]) {
  const candidates = []
  for (let deg = 0; deg < 180; deg += ROTATION_STEP_DEG) {
    // θ and θ - 180 give the same box. -85..90 never turns the map upside down.
    const angle = deg > 90 ? deg - 180 : deg
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const p of points) {
      const x = p.x * cos - p.y * sin
      const y = p.x * sin + p.y * cos
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
    const scale = Math.min(OVERLAY_ASPECT / (right - left), 1 / (bottom - top))
    candidates.push({ angle, scale, left, top, right, bottom })
  }
  const best = candidates.reduce((a, b) => (b.scale > a.scale ? b : a))
  return best.scale > candidates[0].scale * (1 + MIN_ROTATION_GAIN) ? best : candidates[0]
}

export function buildTrackShape(key: string, raw: unknown, trackLengthM: number): TrackShape | null {
  if (!Array.isArray(raw)) return null
  const points = (raw as RestTrackPoint[]).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.z))
  const track = points.filter((p) => p.type === TRACK_POINT_TYPE_TRACK).map((p) => toMapPoint(p.x, p.z))
  const pit = points.filter((p) => p.type === TRACK_POINT_TYPE_PIT).map((p) => toMapPoint(p.x, p.z))
  if (track.length < 2) return null
  if (trackLengthM > 0 && Math.abs(pathLength(track) / trackLengthM - 1) > TRACK_LENGTH_TOLERANCE) return null

  const { angle, left, top, right, bottom } = bestRotation([...track, ...pit])
  const pad = TRACK_SHAPE_PADDING_M

  return {
    key,
    trackPath: svgPath(track, true),
    pitPath: svgPath(pit, false),
    transform: angle ? `rotate(${angle})` : '',
    viewBox: [left - pad, top - pad, right - left + 2 * pad, bottom - top + 2 * pad].map((v) => v.toFixed(1)).join(' ')
  }
}

// Map of the loaded layout. Reloads when the layout key changes, retries while REST
// has no matching map yet (loading).
export class LmuTrackShapeLoader {
  shape: TrackShape | null = null
  private key = ''
  private busy = false
  private lastAttemptAt = 0

  update(key: string, trackLengthM: number): void {
    if (key !== this.key) {
      this.key = key
      this.shape = null
      this.lastAttemptAt = 0
    }
    if (!key || this.shape || this.busy || Date.now() - this.lastAttemptAt < TRACK_SHAPE_RETRY_MS) return

    this.lastAttemptAt = Date.now()
    this.busy = true
    void this.load(key, trackLengthM).finally(() => {
      this.busy = false
    })
  }

  reset(): void {
    this.key = ''
    this.shape = null
  }

  private async load(key: string, trackLengthM: number): Promise<void> {
    const raw = await getJson('/rest/watch/trackmap', TRACK_SHAPE_TIMEOUT_MS)
    if (key !== this.key) return
    this.shape = buildTrackShape(key, raw, trackLengthM)
  }
}

// Shared memory keeps the old session data in the menu (track, all cars), so leaving a
// session is only visible over REST: sessionInfo answers empty there.
export class LmuSessionWatcher {
  inSession = false
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private misses = 0

  start(): void {
    if (this.timer) return
    void this.check()
    this.timer = setInterval(() => void this.check(), SESSION_CHECK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.inSession = false
    this.misses = 0
  }

  private async check(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const info = await getJson('/rest/watch/sessionInfo')
      if (info && typeof info === 'object') {
        this.misses = 0
        this.inSession = true
      } else if (++this.misses >= SESSION_CHECK_MISSES) {
        this.inSession = false
      }
    } finally {
      this.busy = false
    }
  }
}
