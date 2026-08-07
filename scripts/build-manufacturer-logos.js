// One-off local tool, not part of the Electron app itself. Builds the
// manufacturer logo registry the app actually ships and bundles:
// src/renderer/overlay/src/manufacturerLogos/data.json (base64 data-URI per
// manufacturer). Two sources, checked in this order per manufacturer:
//
// 1. resources/manufacturer-logos/<key>.svg or .png are local files the user
//    supplied by hand, gitignored and not in this repo (same pattern as
//    resources/trackmap-assets/). Takes priority if present, so it also
//    doubles as a way to override any of the downloaded ones below.
// 2. @avto-dev/vehicle-logotypes' hosted image CDN. Its npm package only
//    ships a JSON file with remote image URLs, no local files, see
//    https://github.com/avto-dev/vehicle-logotypes.
//
// Either way the network fetch (or local read) only ever happens here, when
// re-generating the registry. The running app stays fully offline.
//
// Keys here are shared with src/main/manufacturerLogos.ts (CarScreenName
// keyword matching), both use the same canonical slug per manufacturer.
//
// Dallara, RAY, Skip Barber, Williams F1 aren't in avto-dev's dataset at
// all. They're niche racing constructors/spec-series brands, not retail car
// manufacturers, so no general-purpose logo library carries them. "generic"
// (iRacing's own placeholder badge for unbadged/unmatched cars, see
// manufacturerLogoKey()'s fallback) isn't a manufacturer either. All five
// are local-only, only bundled once/if a matching file shows up in
// resources/manufacturer-logos/.
//
// Usage: npm run build-manufacturer-logos
const fs = require('node:fs')
const path = require('node:path')

const SOURCE_JSON_URL = 'https://cdn.jsdelivr.net/gh/avto-dev/vehicle-logotypes@2.x/src/vehicle-logotypes.json'
const localDir = path.join(__dirname, '..', 'resources', 'manufacturer-logos')
const outFile = path.join(__dirname, '..', 'src', 'renderer', 'overlay', 'src', 'manufacturerLogos', 'data.json')

// Our canonical key -> avto-dev's slug, only listed where they differ.
const SLUG_OVERRIDES = {
  mercedes: 'mercedes-benz',
  radical: 'radical-sportscars'
}

// Keys with no avto-dev equivalent, local-only (resources/manufacturer-logos/
// or nothing), see header comment.
const LOCAL_ONLY_KEYS = ['dallara', 'ray', 'skip-barber', 'williams-f1', 'generic']

// Our canonical keys. Must stay in sync with MANUFACTURER_KEYWORDS in
// src/main/manufacturerLogos.ts (LOCAL_ONLY_KEYS aside, "generic" is matched
// there too, as the no-brand-detected fallback).
const MANUFACTURER_KEYS = [
  'acura', 'aston-martin', 'audi', 'bmw', 'buick', 'cadillac', 'chevrolet',
  'ferrari', 'ford', 'holden', 'honda', 'hyundai', 'kia', 'lamborghini',
  'ligier', 'lotus', 'mazda', 'mclaren', 'mercedes', 'nissan', 'pontiac',
  'porsche', 'radical', 'ram', 'renault', 'riley', 'ruf', 'subaru', 'toyota',
  'volkswagen',
  ...LOCAL_ONLY_KEYS
]

const MIME_BY_EXT = { '.svg': 'image/svg+xml', '.png': 'image/png' }

// Prefers .svg over .png if both exist for the same key.
function readLocalOverride(key) {
  for (const ext of ['.svg', '.png']) {
    const file = path.join(localDir, `${key}${ext}`)
    if (!fs.existsSync(file)) continue
    const buffer = fs.readFileSync(file)
    return `data:${MIME_BY_EXT[ext]};base64,${buffer.toString('base64')}`
  }
  return null
}

async function fetchFromCdn(key, source) {
  if (LOCAL_ONLY_KEYS.includes(key)) return null

  const slug = SLUG_OVERRIDES[key] ?? key
  const entry = source[slug]
  if (!entry?.logotype?.uri) return null

  const imgRes = await fetch(entry.logotype.uri)
  if (!imgRes.ok) {
    console.warn(`  ! Failed to download logo for "${key}" (${entry.logotype.uri}): ${imgRes.status}`)
    return null
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer())
  const mime = entry.logotype.mime ?? 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
}

async function main() {
  const res = await fetch(SOURCE_JSON_URL)
  if (!res.ok) throw new Error(`Failed to fetch ${SOURCE_JSON_URL}: ${res.status} ${res.statusText}`)
  const source = await res.json()

  const data = {}
  const missing = []

  for (const key of MANUFACTURER_KEYS) {
    const local = readLocalOverride(key)
    const dataUri = local ?? (await fetchFromCdn(key, source))

    if (!dataUri) {
      missing.push(key)
      continue
    }

    data[key] = dataUri
    console.log(`  - ${key}: ${local ? 'local override' : 'avto-dev CDN'} (${dataUri.length} bytes as data-URI)`)
  }

  fs.writeFileSync(outFile, JSON.stringify(data), 'utf8')
  console.log(`\nWrote ${Object.keys(data).length} manufacturer logos to ${outFile}`)
  if (missing.length > 0) {
    console.log(`No logo bundled for (no local file, and none in avto-dev's data): ${missing.join(', ')}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
