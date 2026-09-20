import type { ColorCorrectionMode } from './types'

type CorrectableMode = Exclude<ColorCorrectionMode, 'none'>

// Daltonization correction matrices, one flattened feColorMatrix per deficiency type.
// Build steps:
// 1. Compose (RGB->LMS) * (per-deficiency LMS simulation) * (LMS->RGB) into one 3x3
//    matrix S. S shows how the eye would perceive this color.
// 2. Daltonization adds an error-redistribution step. It pushes the color information
//    lost to S into the channels the person can still perceive.
// 3. Combined correction matrix: C = I + E*(I - S), where E = [[0,0,0],[0.7,1,0],[0.7,0,1]].
//    E leaves the red channel untouched. It pushes the lost signal into green and blue.
// Reference matrices (RGB<->LMS, per-deficiency simulation, E) come from
// joergdietrich/daltonize, which implements Fidaner/Lin/Ozguven 2005. They are composed
// here into one matrix per type, so this runs as a single feColorMatrix instead of a
// multi-pass filter.
// This operates directly on sRGB, not linearized color, matching the reference
// implementation. That is why color-interpolation-filters="sRGB" is set on the
// <filter> that uses these.
export const COLOR_CORRECTION_FILTER_MATRICES: Record<CorrectableMode, string> = {
  protanopia:
    '1 0 0 0 0 ' +
    '0.583425 0.416575 0 0 0 ' +
    '0.638348 -0.638348 1 0 0 ' +
    '0 0 0 1 0',
  deuteranopia:
    '1 0 0 0 0 ' +
    '-0.006573 1.006573 0 0 0 ' +
    '0.451451 -0.451451 1 0 0 ' +
    '0 0 0 1 0',
  tritanopia:
    '1 0 0 0 0 ' +
    '0 1.015958 -0.015958 0 0 ' +
    '0 -0.984042 1.984042 0 0 ' +
    '0 0 0 1 0'
}

export function colorCorrectionFilterId(mode: CorrectableMode): string {
  return `colorblind-${mode}`
}

export const COLOR_CORRECTION_FILTER_SVG_ID = 'color-correction-filter-defs'

// Hidden <svg> holding one <filter> per deficiency type, injected once into
// the document by each renderer, see applyColorCorrectionMode() in
// control/src/App.tsx and overlay/src/useOverlayBridge.ts.
export const COLOR_CORRECTION_FILTER_SVG_MARKUP = `<svg id="${COLOR_CORRECTION_FILTER_SVG_ID}" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${Object.entries(
  COLOR_CORRECTION_FILTER_MATRICES
)
  .map(
    ([mode, values]) =>
      `<filter id="${colorCorrectionFilterId(mode as CorrectableMode)}" color-interpolation-filters="sRGB">` +
      `<feColorMatrix type="matrix" values="${values}" /></filter>`
  )
  .join('')}</svg>`
