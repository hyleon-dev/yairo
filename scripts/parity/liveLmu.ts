import { LmuSource } from '../../src/main/sim/lmu/lmuSource'
import { buildFrameMessages } from '../../src/main/sim/core/frame'

const source = new LmuSource()
const windows = { relative: { ahead: 3, behind: 3 }, standings: { ahead: 3, behind: 3, topCount: 3 } }
let frames = 0
const start = Date.now()
let last: any[] = []
function tick(): void {
  if (source.waitForFrame(200)) {
    const snap = source.read()
    if (snap) { frames++; last = buildFrameMessages(snap, windows) }
  } else source.attach()
  if (Date.now() - start < 3000) setImmediate(tick)
  else {
    const get = (t: string) => last.find((m) => m.type === t)?.data
    const tel = get('telemetry'), st = get('standings'), rel = get('relative'), tm = get('trackmap')
    console.log('frames/s', (frames / 3).toFixed(1))
    console.log('telemetry', JSON.stringify({ spect: tel.isSpectatingOther, speed: tel.speedKph.toFixed(0), rpm: tel.rpm.toFixed(0), gear: tel.gear, thr: tel.throttlePct.toFixed(2), fuel: tel.fuelLevelL.toFixed(1), lap: tel.lap, cur: tel.lapCurrentTime.toFixed(1), best: tel.lapBestTime, delta: tel.lapDeltaToBest.toFixed(2), sl: [tel.rpmSLFirst, tel.rpmSLShift].map((v: number) => v.toFixed(0)), tire: tel.tires.lf }))
    console.log('standings', st.trackName, st.sessionType, 'remain', st.remainingTimeSecs.toFixed(0), 'air', st.airTemp, st.airTempUnit)
    for (const c of st.classes) console.log(' class', c.className, c.classId, c.driverCount, c.drivers.map((d: any) => `P${d.position} #${d.carNumber} ${d.driverName}${d.isPlayer ? '*' : ''} best=${d.bestLapTime.toFixed(2)} gap=${d.gapToLeaderSec.toFixed(2)} logo=${d.manufacturerLogoKey}`).join(' | '))
    console.log('relative', rel.drivers.map((d: any) => `${d.isPlayer ? '>' : ''}P${d.position} ${d.driverName} ${d.gapToPlayerSec.toFixed(1)}s${d.isInPit ? ' PIT' : ''}`).join(' | '))
    console.log('trackmap', tm.trackName, tm.drivers.length, tm.drivers.slice(0, 3).map((d: any) => `${d.carNumber}@${d.lapDistPct.toFixed(3)} ${d.surface}`).join(', '))
    process.exit(0)
  }
}
tick()
