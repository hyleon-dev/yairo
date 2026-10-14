const { Worker } = require('worker_threads')
const path = require('path')
const sim = process.argv[2]
const w = new Worker(path.join(__dirname, '../../out/main/simWorker.js'), { workerData: { simulator: sim } })
const counts = {}
w.on('message', (m) => { counts[m.type] = (counts[m.type] || 0) + 1; if (m.type === 'telemetry') counts.last = m.data.speedKph.toFixed(0) })
w.on('error', (e) => { console.error('worker error', e); process.exit(1) })
setTimeout(() => { console.log(sim, JSON.stringify(counts)); process.exit(0) }, 3000)
