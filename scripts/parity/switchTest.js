// Mimics SimService: start worker, switch back and forth via 'stop' + new worker.
const { Worker } = require('worker_threads')
const path = require('path')
const file = path.join(__dirname, '../../out/main/simWorker.js')
const seq = ['iracing', 'lmu', 'iracing', 'lmu', 'lmu', 'iracing']
async function run() {
  for (const sim of seq) {
    const w = new Worker(file, { workerData: { simulator: sim } })
    let telemetry = 0
    w.on('message', (m) => { if (m.type === 'telemetry') telemetry++ })
    w.on('error', (e) => console.error('worker error', e))
    await new Promise((r) => setTimeout(r, 700))
    const t0 = Date.now()
    const exited = new Promise((r) => w.once('exit', r))
    w.postMessage({ type: 'stop' })
    await exited
    console.log(sim.padEnd(8), 'telemetry msgs', telemetry, 'stopped in', Date.now() - t0, 'ms')
  }
  console.log('all switches ok')
}
run()
