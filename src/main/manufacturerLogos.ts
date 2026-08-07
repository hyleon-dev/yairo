// Resolves a driver's car to a manufacturer logo key (shown next to their
// name in Standings if enabled) for src/renderer/overlay/src/manufacturerLogos/registry.ts.
//
// iRacing's SDK has no dedicated "manufacturer" field per driver/car, only
// things like CarScreenName ("Ferrari 296 GT3 Challenge"), CarPath, CarID.
// So the manufacturer is matched as a keyword against CarScreenName instead.
//
// Keys here are the canonical slugs shared with scripts/build-manufacturer-logos.js
// and its generated src/renderer/overlay/src/manufacturerLogos/data.json.

interface ManufacturerKeyword {
  key: string
  pattern: RegExp
}

// Multi-word/short-form entries
const MANUFACTURER_KEYWORDS: ManufacturerKeyword[] = [
  { key: 'aston-martin', pattern: /\baston\s*-?\s*martin\b/i },
  { key: 'skip-barber', pattern: /\bskip\s*-?\s*barber\b/i },
  { key: 'williams-f1', pattern: /\bwilliams\b/i },
  { key: 'volkswagen', pattern: /\b(volkswagen|vw)\b/i },
  { key: 'mercedes', pattern: /\bmercedes\b/i },
  { key: 'acura', pattern: /\bacura\b/i },
  { key: 'audi', pattern: /\baudi\b/i },
  { key: 'bmw', pattern: /\bbmw\b/i },
  { key: 'buick', pattern: /\bbuick\b/i },
  { key: 'cadillac', pattern: /\bcadillac\b/i },
  { key: 'chevrolet', pattern: /\bchevrolet\b/i },
  { key: 'dallara', pattern: /\bdallara\b/i },
  { key: 'ferrari', pattern: /\bferrari\b/i },
  { key: 'ford', pattern: /\bford\b/i },
  { key: 'holden', pattern: /\bholden\b/i },
  { key: 'honda', pattern: /\bhonda\b/i },
  { key: 'hyundai', pattern: /\bhyundai\b/i },
  { key: 'kia', pattern: /\bkia\b/i },
  { key: 'lamborghini', pattern: /\blamborghini\b/i },
  { key: 'ligier', pattern: /\bligier\b/i },
  { key: 'lotus', pattern: /\blotus\b/i },
  { key: 'mazda', pattern: /\bmazda\b/i },
  { key: 'mclaren', pattern: /\bmclaren\b/i },
  { key: 'nissan', pattern: /\bnissan\b/i },
  { key: 'pontiac', pattern: /\bpontiac\b/i },
  { key: 'porsche', pattern: /\bporsche\b/i },
  { key: 'radical', pattern: /\bradical\b/i },
  { key: 'ram', pattern: /\bram\b/i },
  { key: 'ray', pattern: /\bray\b/i },
  { key: 'renault', pattern: /\brenault\b/i },
  { key: 'riley', pattern: /\briley\b/i },
  { key: 'ruf', pattern: /\bruf\b/i },
  { key: 'subaru', pattern: /\bsubaru\b/i },
  { key: 'toyota', pattern: /\btoyota\b/i }
]

// Falls back to "generic" logo rather than null
// when no manufacturer keyword matches.
export function manufacturerLogoKey(carScreenName: string | undefined | null): string {
  if (!carScreenName) return 'generic'
  return MANUFACTURER_KEYWORDS.find(({ pattern }) => pattern.test(carScreenName))?.key ?? 'generic'
}
