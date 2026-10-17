import koffi from 'koffi'

// Access to iRacing's shared memory, layout from irsdk_defines.h (SDK 1.20).
// Electron's V8 memory cage forbids ArrayBuffers on foreign memory, so every read
// copies into our own Buffer (same as lmuSharedMemory.ts).

const FILE_MAP_READ = 0x0004
const SYNCHRONIZE = 0x00100000
const WAIT_OBJECT_0 = 0

export interface IrsdkObjectNames {
  map: string
  dataEvent: string
}

// Tests pass other names, so they never create objects under the real names.
export const IRSDK_OBJECT_NAMES: IrsdkObjectNames = {
  map: 'Local\\IRSDKMemMapFileName',
  dataEvent: 'Local\\IRSDKDataValidEvent'
}

export const IRSDK_VERSION = 2
const HEADER_SIZE = 112
const VAR_BUF_OFFSET = 48
const VAR_BUF_SIZE = 16
const MAX_BUFS = 4
const STATUS_CONNECTED = 1
const COPY_ATTEMPTS = 2

const kernel32 = koffi.load('kernel32.dll')
const OpenFileMappingA = kernel32.func('void* __stdcall OpenFileMappingA(uint32 access, bool inherit, str name)')
const MapViewOfFile = kernel32.func('void* __stdcall MapViewOfFile(void* h, uint32 access, uint32 hi, uint32 lo, size_t n)')
const UnmapViewOfFile = kernel32.func('bool __stdcall UnmapViewOfFile(void* ptr)')
const OpenEventA = kernel32.func('void* __stdcall OpenEventA(uint32 access, bool inherit, str name)')
const WaitForSingleObject = kernel32.func('uint32 __stdcall WaitForSingleObject(void* h, uint32 ms)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* h)')
const RtlMoveMemory = kernel32.func('void __stdcall RtlMoveMemory(_Out_ uint8_t *dst, intptr src, size_t n)')

export interface IrsdkHeader {
  ver: number
  status: number
  tickRate: number
  sessionInfoUpdate: number
  sessionInfoLen: number
  sessionInfoOffset: number
  numVars: number
  varHeaderOffset: number
  numBuf: number
  bufLen: number
}

export class IrsdkSharedMemory {
  private mapping: unknown = null
  private view: unknown = null
  private dataEvent: unknown = null
  private baseAddress = 0n
  private readonly headerBuffer = Buffer.alloc(HEADER_SIZE)
  private readonly tickBuffer = Buffer.alloc(4)
  private dataBuffer = Buffer.alloc(0)
  private lastTickCount = -1

  constructor(private readonly names = IRSDK_OBJECT_NAMES) {}

  get isOpen(): boolean {
    return this.view !== null
  }

  open(): boolean {
    this.close()
    this.mapping = OpenFileMappingA(FILE_MAP_READ, false, this.names.map)
    // Size 0 maps the whole file. Its size is not known before the header is read.
    this.view = this.mapping ? MapViewOfFile(this.mapping, FILE_MAP_READ, 0, 0, 0) : null
    this.dataEvent = OpenEventA(SYNCHRONIZE, false, this.names.dataEvent)

    if (!this.view || !this.dataEvent) {
      this.close()
      return false
    }
    this.baseAddress = BigInt(koffi.address(this.view))
    return true
  }

  close(): void {
    if (this.view) UnmapViewOfFile(this.view)
    for (const handle of [this.mapping, this.dataEvent]) {
      if (handle) CloseHandle(handle)
    }
    this.mapping = this.view = this.dataEvent = null
    this.baseAddress = 0n
    this.lastTickCount = -1
  }

  isSimConnected(): boolean {
    return this.isOpen && (this.readHeader().status & STATUS_CONNECTED) !== 0
  }

  readHeader(): IrsdkHeader {
    this.copyInto(this.headerBuffer, 0, HEADER_SIZE)
    const b = this.headerBuffer
    return {
      ver: b.readInt32LE(0),
      status: b.readInt32LE(4),
      tickRate: b.readInt32LE(8),
      sessionInfoUpdate: b.readInt32LE(12),
      sessionInfoLen: b.readInt32LE(16),
      sessionInfoOffset: b.readInt32LE(20),
      numVars: b.readInt32LE(24),
      varHeaderOffset: b.readInt32LE(28),
      numBuf: b.readInt32LE(32),
      bufLen: b.readInt32LE(36)
    }
  }

  // Like irsdk_waitForDataReady(): check, wait for the event, check again.
  // The event can still be set from a tick we already read. Then we wait once more.
  // Returns the new data buffer, or null if no new tick arrived.
  waitForFrame(timeoutMs: number): Buffer | null {
    if (!this.dataEvent) return null
    const deadline = performance.now() + timeoutMs
    let data = this.readNewData()
    for (let wait = 0; !data && wait < 2; wait++) {
      const remainingMs = Math.round(deadline - performance.now())
      if (remainingMs <= 0) break
      WaitForSingleObject(this.dataEvent, remainingMs)
      data = this.readNewData()
    }
    return data
  }

  // Reused buffer, valid until the next frame. Like irsdk_getNewData().
  private readNewData(): Buffer | null {
    const header = this.readHeader()
    if (!(header.status & STATUS_CONNECTED)) {
      this.lastTickCount = -1
      return null
    }

    const numBuf = Math.min(header.numBuf, MAX_BUFS)
    let latest = 0
    let latestTick = this.headerBuffer.readInt32LE(VAR_BUF_OFFSET)
    for (let i = 1; i < numBuf; i++) {
      const tick = this.headerBuffer.readInt32LE(VAR_BUF_OFFSET + i * VAR_BUF_SIZE)
      if (tick > latestTick) {
        latest = i
        latestTick = tick
      }
    }

    // Lower tick than before: the sim restarted the session. Resync without data.
    if (latestTick < this.lastTickCount) {
      this.lastTickCount = latestTick
      return null
    }
    if (latestTick === this.lastTickCount) return null

    const tickOffset = VAR_BUF_OFFSET + latest * VAR_BUF_SIZE
    const bufOffset = this.headerBuffer.readInt32LE(tickOffset + 4)
    if (this.dataBuffer.length !== header.bufLen) this.dataBuffer = Buffer.alloc(header.bufLen)

    // The sim may overwrite the buffer during the copy. The tick count then changes.
    for (let attempt = 0; attempt < COPY_ATTEMPTS; attempt++) {
      const tickBefore = this.readInt32(tickOffset)
      this.copyInto(this.dataBuffer, bufOffset, header.bufLen)
      if (this.readInt32(tickOffset) === tickBefore) {
        this.lastTickCount = tickBefore
        return this.dataBuffer
      }
    }
    return null
  }

  copyBytes(offset: number, length: number): Buffer {
    const buffer = Buffer.alloc(Math.max(0, length))
    if (length > 0) this.copyInto(buffer, offset, length)
    return buffer
  }

  private readInt32(offset: number): number {
    this.copyInto(this.tickBuffer, offset, 4)
    return this.tickBuffer.readInt32LE(0)
  }

  private copyInto(target: Buffer, offset: number, length: number): void {
    RtlMoveMemory(target, this.baseAddress + BigInt(offset), length)
  }
}
