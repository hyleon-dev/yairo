import type { FlagsData, TrackMapData, TrackMapDriver } from '../../../shared/types'
import type { SimSnapshot } from '../snapshot'
import { displayDriverName } from './driverNames'

// Places car marker on track based on lapDistPct (0..1) on the SVGs provided.
// Also adds the track surface for on-track/pit-lane/off-track status.
export function buildTrackMap(snap: SimSnapshot): TrackMapData {
  const drivers: TrackMapDriver[] = []
  for (const car of snap.cars) {
    if (!car.isLive || !car.surface) continue

    drivers.push({
      carIdx: car.carIdx,
      carNumber: car.carNumber,
      driverName: displayDriverName(car.carIdx, snap.ownCarIdx, car.driverName),
      classColorHex: car.classColorHex,
      lapDistPct: car.lapDistPct,
      surface: car.surface,
      isPlayer: car.carIdx === snap.focusCarIdx
    })
  }

  return {
    trackId: snap.session.trackId,
    trackName: snap.session.trackName,
    drivers
  }
}

export function buildFlags(snap: SimSnapshot): FlagsData {
  return { flags: snap.session.flags }
}
