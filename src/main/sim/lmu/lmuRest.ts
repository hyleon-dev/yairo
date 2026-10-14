// LMU's local REST API (the game menu's web server). Only reachable on the same PC.
// After some LMU updates only IPv6 answered, so both loopback addresses are tried.
const BASES = ['http://127.0.0.1:6397', 'http://[::1]:6397']
const REQUEST_TIMEOUT_MS = 1000
const FOCUS_POLL_MS = 500
// The vehicle list is ~600 KB.
const VEHICLES_TIMEOUT_MS = 5000
const NATIONALITY_RETRY_MS = 10_000

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
