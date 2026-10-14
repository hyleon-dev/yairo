import koffi from 'koffi'
import { LMU_OFFSETS, LMU_SIZES } from './lmuOffsets'

// Access to LMU's built-in shared memory (LMU_Data), see
// Support/SharedMemoryInterface/SharedMemoryInterface.hpp in the LMU install dir.
// Needs "Settings > Gameplay > Enable Plugins" in LMU, otherwise LMU_Data does not exist.
//
// Electron's V8 memory cage forbids ArrayBuffers on foreign memory (koffi.view crashes).
// So the mapping is copied into our own Buffer, and the header's SharedMemoryLock
// (needs atomic CAS on the mapping) can't be used. Instead the copy is taken right after
// the frame signal, when LMU has just finished writing. TinyPedal reads without lock, too.

const FILE_MAP_READ = 0x0004
const SYNCHRONIZE = 0x00100000
const WAIT_OBJECT_0 = 0
const HWND_OFFSET = LMU_OFFSETS.root.generic + LMU_OFFSETS.generic.appInfo + LMU_OFFSETS.appInfo.mAppWindow

const kernel32 = koffi.load('kernel32.dll')
const user32 = koffi.load('user32.dll')
const OpenFileMappingA = kernel32.func('void* __stdcall OpenFileMappingA(uint32 access, bool inherit, str name)')
const MapViewOfFile = kernel32.func('void* __stdcall MapViewOfFile(void* h, uint32 access, uint32 hi, uint32 lo, size_t n)')
const UnmapViewOfFile = kernel32.func('bool __stdcall UnmapViewOfFile(void* ptr)')
const OpenEventA = kernel32.func('void* __stdcall OpenEventA(uint32 access, bool inherit, str name)')
const WaitForSingleObject = kernel32.func('uint32 __stdcall WaitForSingleObject(void* h, uint32 ms)')
const CloseHandle = kernel32.func('bool __stdcall CloseHandle(void* h)')
const RtlMoveMemory = kernel32.func('void __stdcall RtlMoveMemory(_Out_ uint8_t *dst, void *src, size_t n)')
const RtlMoveMemoryFromAddress = kernel32.func('void __stdcall RtlMoveMemory(_Out_ uint8_t *dst, intptr src, size_t n)')
const IsWindow = user32.func('bool __stdcall IsWindow(intptr hwnd)')

export class LmuSharedMemory {
  private mapping: unknown = null
  private view: unknown = null
  private holdEvent: unknown = null
  private dataEvent: unknown = null
  private readonly buffer = Buffer.alloc(LMU_SIZES.objectOut)
  private readonly hwndBuffer = Buffer.alloc(8)

  get isOpen(): boolean {
    return this.view !== null
  }

  open(): boolean {
    this.close()
    this.mapping = OpenFileMappingA(FILE_MAP_READ, false, 'LMU_Data')
    this.view = this.mapping ? MapViewOfFile(this.mapping, FILE_MAP_READ, 0, 0, LMU_SIZES.objectOut) : null
    this.holdEvent = OpenEventA(SYNCHRONIZE, false, 'LMU_Data_HoldEvent')
    this.dataEvent = OpenEventA(SYNCHRONIZE, false, 'LMU_Data_DataEvent')

    if (!this.view || !this.holdEvent || !this.dataEvent) {
      this.close()
      return false
    }
    return true
  }

  close(): void {
    if (this.view) UnmapViewOfFile(this.view)
    for (const handle of [this.mapping, this.holdEvent, this.dataEvent]) {
      if (handle) CloseHandle(handle)
    }
    this.mapping = this.view = this.holdEvent = this.dataEvent = null
  }

  // Hold first, then Data. The header calls this the only race-free order.
  waitForFrame(timeoutMs: number): boolean {
    if (!this.holdEvent || !this.dataEvent) return false
    return (
      WaitForSingleObject(this.holdEvent, timeoutMs) === WAIT_OBJECT_0 &&
      WaitForSingleObject(this.dataEvent, timeoutMs) === WAIT_OBJECT_0
    )
  }

  // Our handles keep the mapping alive after LMU exits. The game window tells us if it still runs.
  isGameRunning(): boolean {
    if (!this.view) return false
    RtlMoveMemoryFromAddress(this.hwndBuffer, koffi.address(this.view) + BigInt(HWND_OFFSET), 8)
    const hwnd = this.hwndBuffer.readBigInt64LE(0)
    return hwnd !== 0n && IsWindow(hwnd)
  }

  // Reused buffer, valid until the next copy().
  copy(): Buffer | null {
    if (!this.view) return null
    RtlMoveMemory(this.buffer, this.view, LMU_SIZES.objectOut)
    return this.buffer
  }
}
