/**
 * Pure hex/RGB helpers for the accent color picker (Control Center) - no DOM
 * access here so this can be included by both the main process and renderer
 * tsconfig projects.
 */

export interface RgbColor {
  r: number
  g: number
  b: number
}

const HEX_RE = /^#?([0-9a-f]{6})$/i

export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex)
}

export function hexToRgb(hex: string): RgbColor {
  const match = HEX_RE.exec(hex)
  if (!match) return { r: 0, g: 0, b: 0 }
  const int = parseInt(match[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// "r, g, b" form, for CSS custom properties consumed as rgba(var(--x-rgb), a).
export function hexToRgbTriplet(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  return `${r}, ${g}, ${b}`
}
