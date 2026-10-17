import { load } from 'js-yaml'
import { VAR_TYPE, type TelemetryVariable, type TelemetryVarList, type VarType } from './irsdkTypes'

const VAR_HEADER_SIZE = 144
const NAME_LEN = 32
const DESC_LEN = 64
const UNIT_LEN = 32

const VAR_TYPE_BYTES = [1, 1, 4, 4, 4, 8]

export interface VarHeader {
  type: VarType
  offset: number
  count: number
  countAsTime: boolean
  name: string
  desc: string
  unit: string
}

function readCString(buffer: Buffer, start: number, maxLen: number): string {
  const end = buffer.indexOf(0, start)
  return buffer.toString('latin1', start, end === -1 || end > start + maxLen ? start + maxLen : end)
}

export function parseVarHeaders(bytes: Buffer, numVars: number): VarHeader[] {
  const headers: VarHeader[] = []
  for (let i = 0; i < numVars; i++) {
    const base = i * VAR_HEADER_SIZE
    headers.push({
      type: bytes.readInt32LE(base) as VarType,
      offset: bytes.readInt32LE(base + 4),
      count: bytes.readInt32LE(base + 8),
      countAsTime: bytes.readUInt8(base + 12) !== 0,
      name: readCString(bytes, base + 16, NAME_LEN),
      desc: readCString(bytes, base + 48, DESC_LEN),
      unit: readCString(bytes, base + 112, UNIT_LEN)
    })
  }
  return headers
}

function decodeValue(data: Buffer, header: VarHeader): (number | boolean)[] {
  const { type, offset, count } = header
  if (offset < 0 || offset + count * (VAR_TYPE_BYTES[type] ?? 0) > data.length) return []

  const values = new Array(count)
  for (let i = 0; i < count; i++) {
    switch (type) {
      case VAR_TYPE.bool:
        values[i] = data[offset + i] !== 0
        break
      case VAR_TYPE.int:
        values[i] = data.readInt32LE(offset + i * 4)
        break
      // Unsigned. A signed read makes bit 31 (e.g. irsdk_startGo) negative.
      case VAR_TYPE.bitField:
        values[i] = data.readUInt32LE(offset + i * 4)
        break
      case VAR_TYPE.float:
        values[i] = data.readFloatLE(offset + i * 4)
        break
      case VAR_TYPE.double:
        values[i] = data.readDoubleLE(offset + i * 8)
        break
      default:
        values[i] = data[offset + i]
    }
  }
  return values
}

// One object per var-header layout, with a getter per variable. A getter decodes on
// first access and caches the result until the next frame.
export class LazyTelemetry {
  readonly list: TelemetryVarList
  private data: Buffer = Buffer.alloc(0)
  private frame = 0

  constructor(readonly headers: VarHeader[]) {
    const list = {} as Record<string, TelemetryVariable<number | boolean>>
    for (const header of headers) {
      let cachedFrame = -1
      let cached: TelemetryVariable<number | boolean> | undefined
      Object.defineProperty(list, header.name, {
        enumerable: true,
        get: () => {
          if (cachedFrame !== this.frame) {
            cachedFrame = this.frame
            cached = {
              name: header.name,
              description: header.desc,
              unit: header.unit,
              countAsTime: header.countAsTime,
              length: header.count,
              varType: header.type,
              value: decodeValue(this.data, header)
            }
          }
          return cached
        }
      })
    }
    this.list = list as unknown as TelemetryVarList
  }

  setFrame(data: Buffer): void {
    this.data = data
    this.frame++
  }
}

const ENCODING_PATTERN = /^\s*Encoding:\s*(\S+)/m
const UTF8_ENCODING = /^utf[-_]?8$/i
// String fields that iRacing quotes in UTF-8 mode, plus DriverSetupName. In ISO-8859-1 mode
// they come unquoted. Then "Team: 1" breaks the YAML, "123" becomes a number, empty becomes null.
const STRING_FIELDS = [
  'TrackName', 'TrackDisplayName', 'TrackDisplayShortName', 'TrackConfigName', 'TrackCity',
  'TrackState', 'TrackCountry', 'RaceFarm', 'TelemetryDiskFile', 'SessionName', 'GroupName',
  'CameraName', 'FrequencyName', 'TireCompoundType', 'UserName', 'AbbrevName', 'Initials',
  'TeamName', 'CarNumber', 'CarPath', 'CarScreenName', 'CarScreenNameShort', 'CarCfgName',
  'CarCfgCustomPaintExt', 'CarClassShortName', 'DivisionName', 'DriverSetupName'
]
const STRING_FIELD_LINE = new RegExp(`^(\\s*(?:- )?(?:${STRING_FIELDS.join('|')}):)[ \\t]*(.*)$`, 'gm')

// The session string is ISO-8859-1 by default, UTF-8 with irsdkUTF8SessionStr=1 in app.ini.
// WeekendInfo:Encoding says which one. The key is ASCII, so latin1 can find it first.
export function decodeSessionString(bytes: Buffer): string {
  const end = bytes.indexOf(0)
  const raw = end === -1 ? bytes : bytes.subarray(0, end)
  const latin1 = raw.toString('latin1')
  const encoding = ENCODING_PATTERN.exec(latin1)?.[1]
  if (encoding) return UTF8_ENCODING.test(encoding) ? raw.toString('utf8') : latin1
  return isValidUtf8(raw) ? raw.toString('utf8') : latin1
}

function isValidUtf8(bytes: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

function quoteYamlString(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value
  return `"${value.replace(/["\\]/g, '\\$&')}"`
}

export function parseSessionYaml(text: string): Record<string, unknown> | null {
  // iRacing writes empty values in flow lists as ': ,', which is invalid YAML.
  const prepared = text
    .split(': ,')
    .join(': 0,')
    .replace(STRING_FIELD_LINE, (_, key: string, value: string) => `${key} ${quoteYamlString(value.trimEnd())}`)
  const parsed = load(prepared)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
}
