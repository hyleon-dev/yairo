import { EventEmitter } from 'events'
import { join } from 'path'
import { Worker } from 'worker_threads'
import type {
  DriverLapCompletedEvent,
  FlagsData,
  RelativeData,
  SimulatorId,
  StandingsData,
  TelemetryData,
  TrackMapData
} from '../shared/types'
import type { SimWorkerCommand, SimWorkerMessage } from './simWorkerMessages'

// The worker checks for 'stop' once per loop iteration, well below this.
const STOP_TIMEOUT_MS = 3000

interface SimServiceEvents {
  telemetry: (data: TelemetryData) => void
  standings: (data: StandingsData) => void
  relative: (data: RelativeData) => void
  trackmap: (data: TrackMapData) => void
  flags: (data: FlagsData) => void
  connected: () => void
  disconnected: () => void
  lapCompleted: (events: DriverLapCompletedEvent[]) => void
  sessionHeartbeat: (sessionTimeRemainSec: number) => void
}

export declare interface SimService {
  on<K extends keyof SimServiceEvents>(event: K, listener: SimServiceEvents[K]): this
  emit<K extends keyof SimServiceEvents>(
    event: K,
    ...args: Parameters<SimServiceEvents[K]>
  ): boolean
}

// Runs the connection to the selected sim in a worker thread. See simWorker.ts for why.
export class SimService extends EventEmitter {
  private worker: Worker | null = null
  private connected = false
  // Re-sent to every new worker, so a sim switch keeps the current overlay settings.
  private relativeWindow: SimWorkerCommand | null = null
  private standingsWindow: SimWorkerCommand | null = null
  private switching: Promise<void> = Promise.resolve()

  start(simulator: SimulatorId): void {
    if (this.worker) return // already started

    const worker = new Worker(join(__dirname, 'simWorker.js'), { workerData: { simulator } })
    this.worker = worker

    worker.on('message', (message: SimWorkerMessage) => {
      if (this.worker !== worker) return // late message from a stopped worker
      switch (message.type) {
        case 'connected':
          this.connected = true
          this.emit('connected')
          break
        case 'disconnected':
          this.connected = false
          this.emit('disconnected')
          break
        case 'telemetry':
          this.emit('telemetry', message.data)
          break
        case 'standings':
          this.emit('standings', message.data)
          break
        case 'relative':
          this.emit('relative', message.data)
          break
        case 'trackmap':
          this.emit('trackmap', message.data)
          break
        case 'flags':
          this.emit('flags', message.data)
          break
        case 'lap-completed':
          this.emit('lapCompleted', message.events)
          break
        case 'session-heartbeat':
          this.emit('sessionHeartbeat', message.sessionTimeRemainSec)
          break
      }
    })

    worker.on('error', (err) => {
      console.error('sim worker error:', err)
    })

    if (this.relativeWindow) worker.postMessage(this.relativeWindow)
    if (this.standingsWindow) worker.postMessage(this.standingsWindow)
  }

  // Asks the worker to end between two frames (see the 'stop' command) and waits for it.
  async stop(): Promise<void> {
    const worker = this.worker
    this.worker = null
    if (this.connected) {
      this.connected = false
      this.emit('disconnected')
    }
    if (!worker) return

    const exited = new Promise<void>((resolve) => worker.once('exit', () => resolve()))
    const stopCommand: SimWorkerCommand = { type: 'stop' }
    worker.postMessage(stopCommand)

    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), STOP_TIMEOUT_MS))
    ])
    if (timedOut) {
      console.error('sim worker did not stop in time, terminating it')
      await worker.terminate()
    }
  }

  switchSimulator(simulator: SimulatorId): Promise<void> {
    // Serialized, so fast switching never runs two workers at once.
    this.switching = this.switching.then(async () => {
      await this.stop()
      this.start(simulator)
    })
    return this.switching
  }

  // How many drivers ahead/behind the car in focus the Relative overlay
  setRelativeWindow(ahead: number, behind: number): void {
    this.relativeWindow = { type: 'set-relative-window', ahead, behind }
    this.worker?.postMessage(this.relativeWindow)
  }

  // How many drivers ahead/behind the car in focus are shown in the Standings
  // overlay in addition to the leading "topCount" drivers
  setStandingsWindow(ahead: number, behind: number, topCount: number): void {
    this.standingsWindow = { type: 'set-standings-window', ahead, behind, topCount }
    this.worker?.postMessage(this.standingsWindow)
  }
}
