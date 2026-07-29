import trackMapData from './data.json'

export interface TrackMapShape {
  // SVG path "d" data (iRacing's official "active" track map layer)
  path: string
  // 1 or -1, whether increasing lapDistPct moves forward or backward alongthe path's own arc-length parameterization
  direction: number
  // 0..1 - where the start/finish line sits along the path's own arc-length parameterization (the raw path does not start there)
  offset: number
  // Raw inner SVG markup for the start/finish marker (iRacing's official
  // marker layer, path/rect/polygon/use+symbol depending on the track),
  // already positioned within the same 1920x1080 coordinate space as `path`.
  // Missing for a handful of tracks without a bundled marker asset.
  startFinishMarkup?: string
}

// Shared by every track in the dataset
export const TRACK_MAP_VIEW_BOX = '0 0 1920 1080'

// One entry per track layout, keyed by WeekendInfo.TrackID (as a string)
export const TRACK_MAP_SHAPES: Record<string, TrackMapShape> = trackMapData as Record<string, TrackMapShape>
