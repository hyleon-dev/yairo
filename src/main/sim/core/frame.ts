import type { SimWorkerMessage } from '../../simWorkerMessages'
import type { SimSnapshot } from '../snapshot'
import { buildRelative, type RelativeWindow } from './relative'
import { buildStandings, type StandingsWindow } from './standings'
import { buildTelemetry } from './telemetry'
import { buildFlags, buildTrackMap } from './trackMap'
import { checkLapCompletions, updateStintTracking } from './tracking'

export interface DisplayWindows {
  relative: RelativeWindow
  standings: StandingsWindow
}

// All overlay messages for one tick. Order matters: stint tracking must run before
// the payloads, lap stats must update after them.
export function buildFrameMessages(snap: SimSnapshot, windows: DisplayWindows): SimWorkerMessage[] {
  updateStintTracking(snap)

  const messages: SimWorkerMessage[] = [
    { type: 'telemetry', data: buildTelemetry(snap) },
    { type: 'standings', data: buildStandings(snap, windows.standings) },
    { type: 'relative', data: buildRelative(snap, windows.relative) },
    { type: 'trackmap', data: buildTrackMap(snap) },
    { type: 'flags', data: buildFlags(snap) }
  ]

  const lapCompletions = checkLapCompletions(snap)
  if (lapCompletions.length > 0) messages.push({ type: 'lap-completed', events: lapCompletions })

  return messages
}
