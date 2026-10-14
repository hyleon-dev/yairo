import { parentPort, workerData } from 'worker_threads'
import type { SimulatorId, TrackShape } from '../shared/types'
import type { SimSource } from './sim/snapshot'
import { buildFrameMessages, type DisplayWindows } from './sim/core/frame'
import { IracingSource } from './sim/iracing/iracingSource'
import { LmuSource } from './sim/lmu/lmuSource'
import type { SimWorkerCommand, SimWorkerMessage } from './simWorkerMessages'

// Runs as its own worker thread (see simService.ts). Waiting for sim data is a
// blocking native call that's effectively busy almost constantly while
// the sim runs. In the Electron main process that would visibly
// stall the window.

const POLL_INTERVAL_MS = 1000 / 30 // 30 Hz
const RECONNECT_INTERVAL_MS = 2000
const SESSION_HEARTBEAT_INTERVAL_MS = 10_000 // enough to keep the driver-history expiry date fresh

let stopRequested = false

// number of drivers to display around the driver in focus and for class leaders
const windows: DisplayWindows = {
  relative: { ahead: 3, behind: 3 },
  standings: { ahead: 3, behind: 3, topCount: 3 }
}

parentPort?.on('message', (command: SimWorkerCommand) => {
  switch (command.type) {
    case 'set-relative-window':
      windows.relative = { ahead: command.ahead, behind: command.behind }
      break
    case 'set-standings-window':
      windows.standings = { ahead: command.ahead, behind: command.behind, topCount: command.topCount }
      break
    case 'stop':
      stopRequested = true
      break
  }
})

function post(message: SimWorkerMessage): void {
  parentPort?.postMessage(message)
}

function createSource(simulator: SimulatorId): SimSource {
  switch (simulator) {
    case 'iracing':
      return new IracingSource()
    case 'lmu':
      return new LmuSource()
  }
}

const source = createSource((workerData as { simulator?: SimulatorId } | undefined)?.simulator ?? 'iracing')
const log = (text: string): void => console.log(`[${source.name}] ${text}`)

let wasConnected = false
let lastAttachAttempt = Date.now()
let loggedFirstAttempt = false
let lastSessionHeartbeatAt = 0
let lastNeedsSetup = false
let lastTrackShape: TrackShape | null | undefined

function loop(): void {
  // Nothing left to schedule after this, so the worker thread ends on its own.
  if (stopRequested) {
    source.close()
    parentPort?.close()
    return
  }

  const hasData = source.waitForFrame(POLL_INTERVAL_MS)

  if (hasData) {
    if (!wasConnected) {
      wasConnected = true
      log('connected, receiving telemetry')
      post({ type: 'connected' })
    }
    publishFrame()
  } else {
    if (wasConnected) {
      wasConnected = false
      log('connection lost')
      post({ type: 'disconnected' })
      lastTrackShape = undefined
    }

    const now = Date.now()
    if (now - lastAttachAttempt > RECONNECT_INTERVAL_MS) {
      lastAttachAttempt = now
      if (!loggedFirstAttempt) {
        loggedFirstAttempt = true
        log('no data yet, retrying attach...')
      }
      source.attach()
    }
  }

  const needsSetup = !wasConnected && (source.needsSetup ?? false)
  if (needsSetup !== lastNeedsSetup) {
    lastNeedsSetup = needsSetup
    post({ type: 'needs-setup', value: needsSetup })
  }

  setImmediate(loop)
}

function publishFrame(): void {
  const snap = source.read()
  if (!snap) return

  for (const message of buildFrameMessages(snap, windows)) post(message)

  if (snap.trackShape !== undefined && snap.trackShape !== lastTrackShape) {
    lastTrackShape = snap.trackShape
    post({ type: 'track-shape', data: snap.trackShape })
  }

  // Sends the remaining session time to the main process (not every tick).
  // This lets driverStatsStore.ts keep pushing back the driver-history expiry
  // date, as long as telemetry keeps coming in.
  const now = Date.now()
  if (now - lastSessionHeartbeatAt >= SESSION_HEARTBEAT_INTERVAL_MS) {
    lastSessionHeartbeatAt = now
    post({ type: 'session-heartbeat', sessionTimeRemainSec: snap.session.timeRemainSec ?? 0 })
  }
}

loop()
