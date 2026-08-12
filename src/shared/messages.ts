import type { ColorCorrectionMode, OverlayId } from './types'

const stintLapsHint = 'Stint Laps:\niRacing does not provide this info. It is calculated internally from tracked laps. ' +
    'But when the program is not running (e.g. in 24hr races when you turn off your pc) and in the meantime the car pits, ' +
    'it is not tracked and the stint laps will continue to rise when you reconnect and start YAiRO.'

export const messages = {
  control: {
    appTitle: 'Yet Another iRacing Overlay',
    loading: 'Loading configuration…',
    connected: '● iRacing connected',
    disconnected: '○ iRacing not active',
    overlaysHeading: 'Overlays',
    // Only overlays with an entry here get the info ('i') button next to
    // their name in the Control Center. Undefined = no hint yet, no button.
    overlayHints: {
      standings: stintLapsHint,
      relative: stintLapsHint,
      tires: 'The Data is only updated when pitting.'
    } as Partial<Record<OverlayId, string>>,
    updateAvailable: (version: string) => `A new version (${version}) is available.`,
    updateAvailableLink: 'View release',
    positioningHeading: 'Positioning',
    editModeExit: 'Exit edit mode',
    editModeEnter: 'Edit mode',
    editModeHint: 'In edit mode the overlays are clickable and can be dragged around. Turn it back off afterwards so they stay click-through in the game.',
    versionLabel: (version: string) => `v${version}`,
    accentColorBtn: 'Accent color',
    colorCorrectionLabel: 'Color correction mode',
    colorCorrectionOptions: {
      none: 'Color correction: Off',
      protanopia: 'Color correction: Protanopia',
      deuteranopia: 'Color correction: Deuteranopia',
      tritanopia: 'Color correction: Tritanopia'
    } as Record<ColorCorrectionMode, string>
  },
  accentColor: {
    title: 'Accent color',
    hexLabel: 'Hex',
    resetToDefault: 'Reset to default',
    cancel: 'Cancel',
    save: 'Save'
  },
  standings: {
    columnPosition: 'P',
    columnNumber: '#',
    columnDriver: 'Driver',
    columnIRating: 'iR',
    columnSafetyRating: 'SR',
    columnLap: 'Lap',
    columnStint: 'Stint Laps',
    columnGap: 'Gap',
    columnBest: 'Best',
    columnAvgLap: 'Avg',
    columnLast: 'Last',
    leader: 'LEADER',
    classMeta: (driverCount: number, strengthOfField: number) =>
      `${driverCount} Driver · SoF ${strengthOfField}`,
    gripLabel: 'GRIP'
  },
  relative: {
    columnPosition: 'P',
    columnNumber: '#',
    columnDriver: 'Driver',
    columnIRating: 'iR',
    columnSafetyRating: 'SR',
    columnLap: 'Lap',
    columnStint: 'Stint Laps',
    columnGap: 'Gap',
    columnAvgLap: 'Avg',
    columnLast: 'Last'
  },
  trackmap: {
    noMapAvailable: (trackName: string, trackId: number) =>
      `${trackName} (ID ${trackId}) - no track map found`
  },
  overlaySettings: {
    scale: 'Scale',
    scaleUnit: '%',
    opacity: 'Opacity',
    opacityUnit: '%',
    driversAhead: 'Drivers ahead',
    driversBehind: 'Drivers behind',
    topCount: 'Top Drivers',
    showIRating: 'Show iRating',
    showSafetyRating: 'Show Safety Rating',
    showStint: 'Show stint laps',
    showAvgLapTime: 'Show average lap time',
    showBestLapTime: 'Show best lap time',
    showNationFlag: 'Show country flag',
    showManufacturerLogo: 'Show manufacturer logo',
    showIRatingChange: 'Show iRating change',
    showWearPct: 'Show wear %',
    showRpmNumber: 'Show RPM number',
    showLabel: 'Show flag name',
    targetTime: 'Target time',
    resetTargetTime: 'Reset target time',
    resetTargetTime_short: 'Reset',
    showLastLapTime: 'Show last lap time',
    showRealTime: 'Show real time'
  },
  lapTimer: {
    lapLabel: 'LAP',
    lastLap: 'Last',
    bestLap: 'Best',
    targetLap: 'Target'
  },
  telemetry: {
    speedUnit: 'km/h',
    rpmLabel: 'RPM',
    gearLabel: 'Gear:',
    gearNeutral: 'N',
    gearReverse: 'R',
    throttle: 'Throttle',
    brake: 'Brake',
    clutch: 'Clutch',
    pitLimiterLabel: 'PIT',
    lowFuelLabel: 'FUEL'
  },
  fuel: {
    unit: 'l',
    lapsRemaining: (laps: number) => `~${laps.toFixed(1)} LAPS`,
    rangeUnknown: 'Range: –',
    statLastConsumption: 'LAST',
    statLast5Consumption: 'LAST 5',
    statPitBy: 'PIT BY',
    statRemaining: '@END',
    statNextFill: 'NEXT FILL',
    statStopsLeft: 'STOPS',
    predictionsLabel: 'Predictions',
    consumptionLabel: 'Usage /Lap'
  },
  incidents: {
    driver: 'Driver',
    team: 'Team',
    limit: 'Limit',
    unlimited: '∞'
  },
  tires: {
    tempUnit: '°C'
  },
  flags: {
    none: 'NO FLAG',
    green: 'GREEN',
    yellow: 'YELLOW',
    red: 'RED',
    white: 'WHITE',
    blue: 'BLUE',
    checkered: 'CHECKERED',
    black: 'BLACK',
    repair: 'REPAIR',
    caution: 'CAUTION'
  }
} as const
