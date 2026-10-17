import type { IrsdkLike } from './iracingSource'
import { IRSDK_VERSION, IrsdkSharedMemory, type IrsdkHeader } from './irsdkSharedMemory'
import { decodeSessionString, LazyTelemetry, parseSessionYaml, parseVarHeaders } from './irsdkParse'
import type { DriverInfo, SessionList, TelemetryVarList, WeekendInfo } from './irsdkTypes'

const VAR_HEADER_SIZE = 144
const sleepArray = new Int32Array(new SharedArrayBuffer(4))

// Reader for the iRacing SDK. Decodes telemetry lazily
// and parses the session YAML only when iRacing updates it.
export class IrsdkClient implements IrsdkLike {
  private telemetry: LazyTelemetry | null = null
  private layoutKey = ''
  private sessionUpdate = -1
  private sessionData: Record<string, unknown> | null = null
  private loggedVersion = false

  constructor(private readonly shm = new IrsdkSharedMemory()) {}

  startSDK(): boolean {
    if (this.shm.isSimConnected()) return true
    // Fresh handles after iRacing exits, so a restarted sim is picked up.
    if (!this.shm.open()) return false
    this.reset()
    return true
  }

  stopSDK(): void {
    this.shm.close()
    this.reset()
  }

  waitForData(timeoutMs = 1000 / 60): boolean {
    if (!this.shm.isOpen) {
      // Keeps the worker loop from spinning while iRacing is not running.
      Atomics.wait(sleepArray, 0, 0, timeoutMs)
      return false
    }

    const data = this.shm.waitForFrame(timeoutMs)
    if (!data) return false

    const header = this.shm.readHeader()
    this.updateLayout(header)
    this.telemetry?.setFrame(data)
    this.updateSession(header)
    return true
  }

  getTelemetry(): TelemetryVarList {
    return this.telemetry?.list ?? ({} as TelemetryVarList)
  }

  getDriverInfo(): DriverInfo | null {
    return (this.sessionData?.DriverInfo as DriverInfo | undefined) ?? null
  }

  getWeekendInfo(): WeekendInfo | null {
    return (this.sessionData?.WeekendInfo as WeekendInfo | undefined) ?? null
  }

  getSessionInfo(): SessionList | null {
    return (this.sessionData?.SessionInfo as SessionList | undefined) ?? null
  }

  private reset(): void {
    this.telemetry = null
    this.layoutKey = ''
    this.sessionUpdate = -1
    this.sessionData = null
  }

  // Var headers change only with a new connection or car. Three ints tell us.
  private updateLayout(header: IrsdkHeader): void {
    const key = `${header.numVars}:${header.varHeaderOffset}:${header.bufLen}`
    if (key === this.layoutKey) return
    this.layoutKey = key

    if (header.ver !== IRSDK_VERSION && !this.loggedVersion) {
      this.loggedVersion = true
      console.warn(`[iracing] unknown SDK header version ${header.ver}, expected ${IRSDK_VERSION}`)
    }
    const bytes = this.shm.copyBytes(header.varHeaderOffset, header.numVars * VAR_HEADER_SIZE)
    this.telemetry = new LazyTelemetry(parseVarHeaders(bytes, header.numVars))
  }

  private updateSession(header: IrsdkHeader): void {
    if (header.sessionInfoUpdate === this.sessionUpdate) return
    this.sessionUpdate = header.sessionInfoUpdate

    try {
      const bytes = this.shm.copyBytes(header.sessionInfoOffset, header.sessionInfoLen)
      this.sessionData = parseSessionYaml(decodeSessionString(bytes))
    } catch (err) {
      // Keep the last good data. The next update usually parses again.
      console.error('[iracing] could not parse session info:', err)
    }
  }
}
