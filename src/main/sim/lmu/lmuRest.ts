// LMU's local REST API (the game menu's web server). Only reachable on the same PC.
// After some LMU updates only IPv6 answered, so both loopback addresses are tried.
const BASES = ['http://127.0.0.1:6397', 'http://[::1]:6397']
const REQUEST_TIMEOUT_MS = 1000
const FOCUS_POLL_MS = 500

let preferredBase = BASES[0]

async function getJson(route: string): Promise<unknown> {
  for (const base of [preferredBase, ...BASES.filter((b) => b !== preferredBase)]) {
    try {
      const res = await fetch(base + route, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      if (!res.ok) continue
      preferredBase = base
      return await res.json()
    } catch {
      // try next address
    }
  }
  return undefined
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
