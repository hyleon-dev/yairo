// One-off local tool. Not part of the running app.
// Copies iRacing's raw shared memory to dump_iracing_raw.bin in the project root
// and prints the header values. The .bin is a test fixture for the own SDK reader
// (dev-docs/plan-own-irsdk.md, phase 0). Run once with irsdkUTF8SessionStr=0 and once
// with =1 in iRacing's app.ini and rename the files in between.
//
// Usage: npm run dump:iracing-raw (iRacing must be running with an active session)
const fs = require('node:fs')
const path = require('node:path')
const koffi = require('koffi')

const FILE_MAP_READ = 0x0004
const HEADER_SIZE = 112
const VAR_HEADER_SIZE = 144
const outPath = path.join(__dirname, '..', 'dump_iracing_raw.bin')

const kernel32 = koffi.load('kernel32.dll')
const OpenFileMappingA = kernel32.func('void* __stdcall OpenFileMappingA(uint32 access, bool inherit, str name)')
const MapViewOfFile = kernel32.func('void* __stdcall MapViewOfFile(void* h, uint32 access, uint32 hi, uint32 lo, size_t n)')
const RtlMoveMemory = kernel32.func('void __stdcall RtlMoveMemory(_Out_ uint8_t *dst, intptr src, size_t n)')

const mapping = OpenFileMappingA(FILE_MAP_READ, false, 'Local\\IRSDKMemMapFileName')
const view = mapping && MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, 0)
if (!view) {
  console.error('[dump-iracing-raw] iRacing shared memory not found. Is iRacing running?')
  process.exit(1)
}
const base = BigInt(koffi.address(view))

const header = Buffer.alloc(HEADER_SIZE)
RtlMoveMemory(header, base, HEADER_SIZE)
const int = (offset) => header.readInt32LE(offset)
const info = {
  ver: int(0),
  status: int(4),
  tickRate: int(8),
  sessionInfoUpdate: int(12),
  sessionInfoLen: int(16),
  sessionInfoOffset: int(20),
  numVars: int(24),
  varHeaderOffset: int(28),
  numBuf: int(32),
  bufLen: int(36),
  varBufs: [0, 1, 2, 3].map((i) => ({ tickCount: int(48 + i * 16), bufOffset: int(52 + i * 16) }))
}

const ends = [
  info.sessionInfoOffset + info.sessionInfoLen,
  info.varHeaderOffset + info.numVars * VAR_HEADER_SIZE,
  ...info.varBufs.slice(0, info.numBuf).map((b) => b.bufOffset + info.bufLen)
]
const size = Math.max(...ends)
const dump = Buffer.alloc(size)
RtlMoveMemory(dump, base, size)
fs.writeFileSync(outPath, dump)

const session = dump.subarray(info.sessionInfoOffset, info.sessionInfoOffset + info.sessionInfoLen)
const sessionEnd = session.indexOf(0)
const sessionText = session.toString('latin1', 0, sessionEnd === -1 ? session.length : sessionEnd)
const encoding = /^\s*Encoding:\s*(\S+)/m.exec(sessionText)?.[1] ?? '(not found)'

console.log(info)
console.log(`session string length: ${sessionText.length}`)
console.log(`WeekendInfo Encoding: ${encoding}`)
console.log(`[dump-iracing-raw] wrote ${outPath} (${size} bytes)`)
