// One-off local tool. Not part of the running app.
// Connects to the live iRacing SDK and waits for a session. Then it writes a full
// snapshot of all decoded SDK data (telemetry + driver/weekend/session info) to
// dump_iracing.json in the project root. Use this to explore which fields the local
// iRacing SDK provides, without attaching a debugger. Overwrites any existing
// dump_iracing.json from a previous run.
//
// Runs with tsx, so it can use the app's own TypeScript reader (IrsdkClient).
//
// Usage: npm run dump:iracing (iRacing must be running with an active session)
const fs = require('node:fs')
const path = require('node:path')
const { IrsdkClient } = require('../src/main/sim/iracing/irsdkClient')

const POLL_INTERVAL_MS = 1000 / 30
const RECONNECT_INTERVAL_MS = 2000
const TIMEOUT_MS = 15_000
const outPath = path.join(__dirname, '..', 'dump_iracing.json')

const sdk = new IrsdkClient()
sdk.startSDK()

const deadline = Date.now() + TIMEOUT_MS
let lastStartAttempt = Date.now()

console.log('[dump-iracing] waiting for iRacing...')

function tick() {
  if (sdk.waitForData(POLL_INTERVAL_MS) && sdk.getDriverInfo()) {
    const dump = {
      telemetry: sdk.getTelemetry(),
      driverInfo: sdk.getDriverInfo(),
      weekendInfo: sdk.getWeekendInfo(),
      sessionInfo: sdk.getSessionInfo()
    }
    fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf-8')
    console.log(`[dump-iracing] wrote ${outPath}`)
    sdk.stopSDK()
    return
  }

  if (Date.now() > deadline) {
    console.error('[dump-iracing] timed out waiting for iRacing. Is it running with an active session?')
    process.exit(1)
  }

  if (Date.now() - lastStartAttempt > RECONNECT_INTERVAL_MS) {
    lastStartAttempt = Date.now()
    sdk.startSDK()
  }

  setImmediate(tick)
}

tick()
