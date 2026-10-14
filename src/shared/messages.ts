import type { ColorCorrectionMode, OverlayId, SimulatorId } from './types'

// Without simulators the hint applies to every sim.
export interface Hint {
  text: string
  simulators?: readonly SimulatorId[]
}

const stintLapsHint = 'The sim does not provide this info. It is calculated internally from tracked laps. ' +
    'When the program is not running (e.g. in 24hr races when you turn off your pc) and in the meantime the car pits, ' +
    'it is not tracked and the stint laps won\'t be correct when you reconnect and start YAiRO until the car boxes.'

export const messages = {
  control: {
    appTitle: 'Yet Another iRacing Overlay',
    loading: 'Loading configuration…',
    connected: (simName: string) => `● ${simName} connected`,
    disconnected: (simName: string) => `○ ${simName} not active`,
    simulatorHeading: 'Simulation',
    simulators: {
      iracing: { name: 'iRacing', mark: 'iR', setupHint: '' },
      lmu: {
        name: 'Le Mans Ultimate',
        mark: 'LMU',
        setupHint: 'No data. Turn on "Settings > Gameplay > Enable Plugins" in LMU and restart LMU.'
      }
    } as Record<SimulatorId, { name: string; mark: string; setupHint: string }>,
    simulatorConnected: 'connected',
    simulatorWaiting: 'waiting for sim',
    simulatorInactive: 'inactive',
    overlaysHeading: 'Overlays',
    // Info ('i') button next to the overlay name. Only shown if a hint applies to the active sim.
    overlayHints: {
      tires: [{ text: 'The data is only updated when pitting.', simulators: ['iracing'] }]
    } as Partial<Record<OverlayId, Hint[]>>,
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
    } as Record<ColorCorrectionMode, string>,
    targetTimeHeader: 'Target Time'
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
    columnPitStops: 'Pit',
    leader: 'LEADER',
    classMeta: (driverCount: number, strengthOfField: number | null) =>
      strengthOfField === null ? `${driverCount} Driver` : `${driverCount} Driver · SoF ${strengthOfField}`,
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
    showStintHints: [{ text: stintLapsHint }] as Hint[],
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
    showPitStops: 'Show pit stops',
    showLapHistory: 'Show usage of last laps',
    showPenalties: 'Show penalty flag',
    showRealTime: 'Show real time',
    showDeltaNumber: 'Show delta number',
    barWidth: 'Bar width',
    barWidthUnit: 'px'
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
    unitVirtualEnergy: '% VE',
    lapsRemaining: (laps: number) => `~${laps.toFixed(1)} LAPS`,
    rangeUnknown: 'Range: –',
    statLastConsumption: 'LAST',
    statLast5Consumption: 'LAST 5',
    statPitBy: 'PIT BY',
    statRemaining: '@END',
    statNextFill: 'NEXT FILL',
    statStopsLeft: 'Stops',
    predictionsLabel: 'Predictions',
    consumptionLabel: 'Usage /Lap',
    historyLabel: 'Last Laps',
    historyLap: (lap: number) => `L${lap}`
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
  damage: {
    overheating: 'OVERHEATING',
    partsDetached: 'PARTS LOST'
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
