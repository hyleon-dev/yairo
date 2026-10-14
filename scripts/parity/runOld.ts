import './patch'
import { writeFileSync } from 'node:fs'
import { FRAMES, ScenarioSdk } from './scenario'

const sdk = new ScenarioSdk()
;(globalThis as any).__paritySdk = sdk

// eslint-disable-next-line @typescript-eslint/no-require-imports
const old = require('./oldWorker') as typeof import('./oldWorker')

const out: unknown[] = []
for (let i = 0; i < FRAMES; i++) {
  sdk.waitForData()
  old.posted.length = 0
  old.publishTelemetry()
  out.push(old.posted.filter((m) => m.type !== 'session-heartbeat'))
}
writeFileSync(process.argv[2], JSON.stringify(out))
