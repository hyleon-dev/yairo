// Screenshot/README mode: keeps using real telemetry, but swaps every other
// driver's name for a random fake one. This keeps real names out of screenshots.
// Own car keeps its real name.
const anonymizeNames = process.env.ANONYMIZE_DRIVER_NAMES === '1'
if (anonymizeNames) {
  console.log('[sim] ANONYMIZE_DRIVER_NAMES=1 - replacing other drivers\' names with random fake ones')
}

const ANON_FIRST_NAMES = [
  'Alex', 'Jordan', 'Sam', 'Casey', 'Morgan', 'Taylor', 'Riley', 'Jamie', 'Drew', 'Cameron',
  'Avery', 'Reese', 'Skyler', 'Quinn', 'Rowan', 'Blake', 'Emerson', 'Hayden', 'Parker', 'Sawyer'
]
const ANON_LAST_NAMES = [
  'Turner', 'Bishop', 'Cole', 'Reed', 'Hayes', 'Foster', 'Price', 'Sloane', 'Vance', 'Marsh',
  'Kerr', 'Doyle', 'Lang', 'Brady', 'Nash', 'Voss', 'Kane', 'Rhodes', 'Pierce', 'Wade'
]

const fakeNameByCarIdx = new Map<number, string>()
const usedFakeNames = new Set<string>()

function fakeNameFor(carIdx: number): string {
  const cached = fakeNameByCarIdx.get(carIdx)
  if (cached) return cached

  let name = ''
  for (let attempts = 0; attempts < 20; attempts++) {
    const first = ANON_FIRST_NAMES[Math.floor(Math.random() * ANON_FIRST_NAMES.length)]
    const last = ANON_LAST_NAMES[Math.floor(Math.random() * ANON_LAST_NAMES.length)]
    name = `${first} ${last}`
    if (!usedFakeNames.has(name)) break
  }

  usedFakeNames.add(name)
  fakeNameByCarIdx.set(carIdx, name)
  return name
}

export function displayDriverName(carIdx: number, ownCarIdx: number, realName: string): string {
  if (!anonymizeNames || carIdx === ownCarIdx) return realName
  return fakeNameFor(carIdx)
}
