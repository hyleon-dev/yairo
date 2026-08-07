// One-off local tool, not part of the running app. Connects to the live
// iRacing SDK, waits for a session, and writes a full snapshot of all raw
// SDK data (telemetry + driver/weekend/session info) to sdk-dump.json in the
// project root, for exploring which fields the local iRacing SDK actually
// provides without attaching a debugger. Overwrites any existing
// sdk-dump.json from a previous run.
//
// Runs via Electron's own Node runtime (ELECTRON_RUN_AS_NODE=1, see the
// "dump-sdk" script in package.json) instead of plain "node", because
// irsdk-node is a native addon rebuilt against Electron's Node ABI by the
// "postinstall" step (electron-builder install-app-deps). Running it under
// system Node would fail with a NODE_MODULE_VERSION mismatch. No Electron
// window/app module is involved, this just uses Electron's binary as a Node
// runtime.
//
// Usage: npm run dump-sdk (iRacing must be running with an active session)
const fs = require('node:fs')
const path = require('node:path')
const { IRacingSDK } = require('irsdk-node')

const POLL_INTERVAL_MS = 1000 / 30
const RECONNECT_INTERVAL_MS = 2000
const TIMEOUT_MS = 15_000
const outPath = path.join(__dirname, '..', 'sdk-dump.json')

const sdk = new IRacingSDK({ autoEnableTelemetry: true })
sdk.startSDK()

const deadline = Date.now() + TIMEOUT_MS
let lastStartAttempt = Date.now()

console.log('[dump-sdk] waiting for iRacing...')

function tick() {
  const hasData = sdk.waitForData(POLL_INTERVAL_MS)

  if (hasData) {
    const dump = {
      telemetry: sdk.getTelemetry(),
      driverInfo: sdk.getDriverInfo(),
      weekendInfo: sdk.getWeekendInfo(),
      sessionInfo: sdk.getSessionInfo()
    }
    fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf-8')
    console.log(`[dump-sdk] wrote ${outPath}`)
    process.exit(0)
  }

  if (Date.now() > deadline) {
    console.error('[dump-sdk] timed out waiting for iRacing - is it running with an active session?')
    process.exit(1)
  }

  // First attach attempt can fail if iRacing was already running before this
  // script started, keep retrying while disconnected (same pattern as
  // irsdkWorker.ts).
  if (Date.now() - lastStartAttempt > RECONNECT_INTERVAL_MS) {
    lastStartAttempt = Date.now()
    sdk.startSDK()
  }

  setImmediate(tick)
}

tick()
