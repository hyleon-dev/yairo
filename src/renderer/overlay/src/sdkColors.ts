import type { CSSProperties } from 'react'

// Small collection of styles derived from a 0xRRGGBB color value provided by
// the SDK (see sdkColorHex() in irsdkWorker.ts) - one use each for
// Driver.LicColor and Driver.CarClassColor.

// Colors the Safety Rating badge (col-sr in Standings/Relative) to match
// license color provided by the SDK (Driver.LicColor).
export function licBadgeStyle(colorHex: string): CSSProperties {
  const { r, g, b } = hexToRgb(colorHex)
  return {
    color: colorHex,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.18)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.55)`
  }
}

// Gradient in the position column (col-pos, first column in Standings/Relative),
// matching the car class color provided by the SDK (Driver.CarClassColor)
export function classPositionGradient(colorHex: string): CSSProperties {
  const { r, g, b } = hexToRgb(colorHex)
  return {
    background: `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0.35) 0%, rgba(${r}, ${g}, ${b}, 0) 100%)`
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(hex.slice(1), 16)
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}
