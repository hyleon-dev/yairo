import { EventEmitter } from 'events'
import { join } from 'path'
import { Worker } from 'worker_threads'
import type {
  DriverLapCompletedEvent,
  FlagsData,
  RelativeData,
  StandingsData,
  TelemetryData,
  TrackMapData
} from '../shared/types'
import type { IrsdkWorkerCommand, IrsdkWorkerMessage } from './irsdkWorkerMessages'

interface IrsdkServiceEvents {
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

export declare interface IrsdkService {
  on<K extends keyof IrsdkServiceEvents>(event: K, listener: IrsdkServiceEvents[K]): this
  emit<K extends keyof IrsdkServiceEvents>(
    event: K,
    ...args: Parameters<IrsdkServiceEvents[K]>
  ): boolean
}

// Runs the actual irsdk-node connection in a worker thread, see irsdkWorker.ts for why.
export class IrsdkService extends EventEmitter {
  private worker: Worker | null = null

  start(): void {
    if (this.worker) return // already started

    this.worker = new Worker(join(__dirname, 'irsdkWorker.js'))

    this.worker.on('message', (message: IrsdkWorkerMessage) => {
      switch (message.type) {
        case 'connected':
          this.emit('connected')
          break
        case 'disconnected':
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

    this.worker.on('error', (err) => {
      console.error('irsdk worker error:', err)
    })
  }

  stop(): void {
    void this.worker?.terminate()
    this.worker = null
  }

  // How many drivers ahead/behind the car in focus the Relative overlay
  setRelativeWindow(ahead: number, behind: number): void {
    const command: IrsdkWorkerCommand = { type: 'set-relative-window', ahead, behind }
    this.worker?.postMessage(command)
  }

  // How many drivers ahead/behind the car in focus are shown in the Standings
  // overlay in addition to the leading "topCount" drivers
  setStandingsWindow(ahead: number, behind: number, topCount: number): void {
    const command: IrsdkWorkerCommand = { type: 'set-standings-window', ahead, behind, topCount }
    this.worker?.postMessage(command)
  }
}
