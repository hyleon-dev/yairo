import countries from 'flag-icons/country.json'

// Resolves a driver's iRacing "FlairName" (nationality, shown next to their
// name in Standings if enabled) to a flag-icons ISO code (see
// https://github.com/lipis/flag-icons, bundled via the "flag-icons" npm
// package - node_modules/flag-icons/country.json is its own name->code
// table). Not verified against a real FlairName value from a live session
// (no confirmed sample at the time this was written) - if a name doesn't
// resolve and it clearly should, add it to FLAIR_NAME_ALIASES below.

interface FlagCountry {
  code: string
  name: string
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

const NAME_TO_CODE = new Map<string, string>((countries as FlagCountry[]).map((c) => [normalize(c.name), c.code]))

// iRacing's FlairName wording for some countries is expected not to match
// flag-icons' official ISO short name 1:1 (e.g. common/short forms vs. full
// official names, alternate spellings) - mapped here to the flag-icons name.
const FLAIR_NAME_ALIASES: Record<string, string> = {
  usa: 'united states of america',
  'united states': 'united states of america',
  us: 'united states of america',
  uk: 'united kingdom',
  'great britain': 'united kingdom',
  russia: 'russia',
  'russian federation': 'russia',
  'south korea': 'south korea',
  'republic of korea': 'south korea',
  'korea, republic of': 'south korea',
  'north korea': 'north korea',
  "democratic people's republic of korea": 'north korea',
  iran: 'iran',
  'iran, islamic republic of': 'iran',
  czechia: 'czech republic',
  'ivory coast': "côte d'ivoire",
  "cote d'ivoire": "côte d'ivoire",
  "lao people's democratic republic": 'laos',
  burma: 'myanmar',
  vatican: 'holy see',
  'vatican city': 'holy see',
  macedonia: 'north macedonia',
  'chinese taipei': 'taiwan',
  'viet nam': 'vietnam',
  brunei: 'brunei darussalam',
  'cape verde': 'cabo verde',
  swaziland: 'eswatini'
}

export function flairNameToIsoCode(flairName: string | undefined | null): string | null {
  if (!flairName) return null
  const key = normalize(flairName)
  return NAME_TO_CODE.get(key) ?? NAME_TO_CODE.get(FLAIR_NAME_ALIASES[key] ?? '') ?? null
}
