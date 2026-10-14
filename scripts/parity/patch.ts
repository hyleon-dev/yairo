// Deterministic clock and RNG, installed before anything else is evaluated.
let now = 1_700_000_000_000
Date.now = () => now
export function advanceClock(ms: number): void {
  now += ms
}

let seed = 42
Math.random = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
