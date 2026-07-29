// One-off local tool, not part of the Electron app itself. Converts the raw
// downloaded track map assets (resources/trackmap-assets/) into the compact per-track data
// file the app actually ships and bundles: src/renderer/overlay/src/trackmaps/data.json.
//
// Needs track_info.json (activePath per track), track_settings.json
// (direction/offset calibration per track, plus an optional customTrackPath
// override), and start_finish/<id>.svg (start/finish marker, already
// positioned in the same 1920x1080 coordinate space as activePath - no
// direction/offset calibration needed for it, unlike the per-car dot
// placement along the track path).
//
// The start/finish marker SVGs aren't all built the same way - some use a
// plain <path>, others <rect>/<polygon>, and a handful reference a
// <symbol> via <use> (with its own viewBox + a translate/rotate/scale
// transform). Rather than hand-parse every variant, the raw inner SVG markup
// (everything between <svg> and </svg>, defs/style/symbol included) is
// stored as-is and injected directly into a <g> at render time;
// the browser's own SVG engine then resolves <use>/<symbol> correctly for free.
//
// A handful of tracks (Suzuka, Monza, Charlotte Roval - all figure-eight-ish
// or with a tricky pit/infield loop) ship a customTrackPath in
// track_settings.json instead of relying on the plain activePath. direction/
// offset for those tracks were evidently calibrated against customTrackPath,
// not activePath, using activePath there desyncs the arc-length
// parameterization from the calibration (cars drifting backwards, pit lane
// cars misplaced). Prefer customTrackPath whenever present.
//
// Usage: npm run build-trackmaps
const fs = require('node:fs')
const path = require('node:path')

const assetsDir = path.join(__dirname, '..', 'resources', 'trackmap-assets')
const outFile = path.join(__dirname, '..', 'src', 'renderer', 'overlay', 'src', 'trackmaps', 'data.json')

const trackInfo = JSON.parse(fs.readFileSync(path.join(assetsDir, 'track_info.json'), 'utf8'))
const trackSettings = JSON.parse(fs.readFileSync(path.join(assetsDir, 'track_settings.json'), 'utf8'))

function readStartFinishMarkup(id) {
  const file = path.join(assetsDir, 'start_finish', `${id}.svg`)
  if (!fs.existsSync(file)) return undefined

  const svg = fs.readFileSync(file, 'utf8')
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  const inner = match?.[1]?.trim()
  return inner ? inner : undefined
}

const data = {}
let skipped = 0
let withStartFinish = 0
for (const [id, info] of Object.entries(trackInfo)) {
  const settings = trackSettings[id]
  if (!info.activePath || !settings) {
    skipped++
    continue
  }

  const startFinishMarkup = readStartFinishMarkup(id)
  if (startFinishMarkup) withStartFinish++

  data[id] = {
    path: settings.customTrackPath ?? info.activePath,
    direction: settings.direction,
    offset: settings.offset,
    ...(startFinishMarkup ? { startFinishMarkup } : {})
  }
}

fs.writeFileSync(outFile, JSON.stringify(data), 'utf8')
console.log(
  `Wrote ${Object.keys(data).length} track shapes to ${outFile} (${withStartFinish} with a start/finish marker, skipped ${skipped} without calibration data)`
)
