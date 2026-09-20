// One-off local tool. Not part of the Electron app itself.
// Converts the raw downloaded track map assets (resources/trackmap-assets/) into the
// compact per-track data file the app ships and bundles:
// src/renderer/overlay/src/trackmaps/data.json.
//
// Needs three inputs:
// - track_info.json: activePath per track.
// - track_settings.json: direction/offset calibration per track, plus an optional
//   customTrackPath override.
// - start_finish/<id>.svg: the start/finish marker. It is already positioned in the
//   same 1920x1080 coordinate space as activePath, so it needs no direction/offset
//   calibration, unlike the per-car dot placement along the track path.
//
// The start/finish marker SVGs are not all built the same way. Some use a plain
// <path>, others use <rect>/<polygon>, and a few reference a <symbol> via <use>
// (with its own viewBox and a translate/rotate/scale transform). Rather than
// hand-parse every variant, the raw inner SVG markup is stored as-is (everything
// between <svg> and </svg>, defs/style/symbol included) and injected directly into
// a <g> at render time. The browser's own SVG engine then resolves <use>/<symbol>
// for free.
//
// A few tracks ship a customTrackPath in track_settings.json instead of using the
// plain activePath (Suzuka, Monza, Charlotte Roval, and other figure-eight-like
// tracks, or tracks with a tricky pit/infield loop). Their direction/offset values
// were calibrated against customTrackPath, not activePath. Using activePath there
// would desync the arc-length parameterization from the calibration: cars would
// drift backwards, and pit lane cars would be misplaced. Prefer customTrackPath
// whenever it is present.
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
