import './patch'
import { writeFileSync } from 'node:fs'
import { FRAMES, ScenarioSdk } from './scenario'
import { IracingSource } from '../../src/main/sim/iracing/iracingSource'
import { buildFrameMessages } from '../../src/main/sim/core/frame'

const sdk = new ScenarioSdk()
const source = new IracingSource(sdk)
const windows = { relative: { ahead: 3, behind: 3 }, standings: { ahead: 3, behind: 3, topCount: 3 } }

const out: unknown[] = []
for (let i = 0; i < FRAMES; i++) {
  source.waitForFrame(0)
  const snap = source.read()
  out.push(snap ? buildFrameMessages(snap, windows) : [])
}
writeFileSync(process.argv[2], JSON.stringify(out))
