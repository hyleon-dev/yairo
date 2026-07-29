
// Central collection of all user-facing UI text, components import
// strings from here instead of hardcoding them inline.

export const messages = {
  control: {
    appTitle: 'Yet Another iRacing Overlay',
    loading: 'Loading configuration…',
    connected: '● iRacing connected',
    disconnected: '○ iRacing not active',
    overlaysHeading: 'Overlays',
    overlayUrlCopy: '🔗',
    overlayUrlCopied: '✅',
    positioningHeading: 'Positioning',
    editModeExit: 'Exit edit mode',
    editModeEnter: 'Move overlays (edit mode)',
    editModeHint:
        'In edit mode the overlays are clickable and can be dragged around. Turn it back off afterwards so they stay click-through in the game.'
  },
  overlayApp: {
    waitingForSession: 'Waiting for session…',
    waitingForIracing: 'Waiting for iRacing…',
    noActiveCar: 'No active car (spectator/pit)',
    notAvailableSpectating: 'Not available while spectating'
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
    columnGap: 'Gap'
  },
  trackmap: {
    noMapAvailable: (trackName: string, trackId: number) =>
      `${trackName} (ID ${trackId}) - no track map found`
  },
  overlaySettings: {
    scale: 'Scale',
    scaleUnit: '%',
    driversAhead: 'Drivers ahead',
    driversBehind: 'Drivers behind',
    topCount: 'Top Drivers',
    showIRating: 'Show iRating',
    showSafetyRating: 'Show Safety Rating',
    showStint: 'Show stint laps'
  },
  lapTimer: {
    lapLabel: 'LAP',
    lastLap: 'Last',
    bestLap: 'Best'
  },
  telemetry: {
    speedUnit: 'km/h',
    rpmLabel: 'RPM',
    gearLabel: 'Gear:',
    gearNeutral: 'N',
    gearReverse: 'R',
    throttle: 'Throttle',
    brake: 'Brake',
    clutch: 'Clutch'
  },
  fuel: {
    unit: 'L Fuel',
    lapsRemaining: (laps: number) => `~${laps.toFixed(1)} laps remaining`,
    rangeUnknown: 'Range: –',
    columnConsumption: 'Consumption',
    columnMargin: 'Margin',
    columnPitBy: 'Pit by',
    rowLastLap: 'Last',
    rowAvg5: 'Last 5'
  },
  incidents: {
    driver: 'Driver',
    team: 'Team',
    limit: 'Limit'
  }
} as const
