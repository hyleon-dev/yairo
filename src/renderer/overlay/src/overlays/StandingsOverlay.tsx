import { Fragment } from 'react'
import type { DriverStanding, StandingsClass, StandingsData, StandingsOverlaySettings } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { classPositionGradient, licBadgeStyle } from '../sdkColors'
import './StandingsOverlay.css'

const m = messages.standings

// The iRating/SR columns are toggleable independently (see OverlaySettingsPanel.tsx),
// grid column widths are computed instead of fixed in CSS, so the header and
// data rows stay aligned regardless of combination.
function gridTemplate(settings: StandingsOverlaySettings): string {
  const cols = ['22px', '32px', '1fr']
  if (settings.showIRating) cols.push('42px')
  if (settings.showSafetyRating) cols.push('54px')
  cols.push('32px')
  if (settings.showStint) cols.push('40px')
  cols.push('70px')
  if (settings.showAvgLapTime) cols.push('70px')
  if (settings.showBestLapTime) cols.push('80px')
  return cols.join(' ')
}

function fmtGap(gap: number, position: number): string {
  if (position === 1) return m.leader
  if (gap <= 0) return '--:--.--'
  return `+${gap.toFixed(3)}`
}

function fmtTemp(temp: number, unit: string): string {
  return `${temp.toFixed(0)}°${unit}`
}

function fmtTime(secs: number, fractionsSecs: number, padSecs: number, padMins: number, useHours = false): string {
  if (secs <= 0) return '–'
  const h = useHours ? Math.floor(secs / 3600) : 0
  const m = (Math.floor((secs - (h * 3600)) / 60)).toFixed(0).padStart(padMins, '0')
  const s = (secs % 60).toFixed(fractionsSecs).padStart(padSecs, '0')
  return `${h != 0 ? `${h}:` : ''}${m}:${s}`
}

function fmtLapTime(secs: number): string {
  return fmtTime(secs, 3, 6, 1)
}

function fmtSessionTime(secs: number): string {
  return fmtTime(secs, 0, 2, 2, true)
}

function fmtGrip(grip: string): string {

  switch (grip.toLowerCase()) {
    case 'moderately low usage': return 'ML'
    default: return grip.toUpperCase().replace(' USAGE', '')
  }
}

function DriverRow({
  driver,
  settings,
  template
}: {
  driver: DriverStanding
  settings: StandingsOverlaySettings
  template: string
}) {
  return (
    <div
      className={`driver-row ${driver.isPlayer ? 'driver-row--player' : ''}`}
      style={{ gridTemplateColumns: template }}
    >
      <span className="col-pos" style={classPositionGradient(driver.classColorHex)}>
        {driver.position}
      </span>
      <span className="col-num">#{driver.carNumber}</span>
      <span className="col-name">{driver.driverName}</span>
      {settings.showIRating && <span className="col-irating">{driver.iRating > 0 ? driver.iRating : '-'}</span>}
      {settings.showSafetyRating && (
        <span className="col-sr" style={licBadgeStyle(driver.licColorHex)}>
          {driver.licString || '-'}
        </span>
      )}
      <span className="col-lap">{driver.lapsCompleted == -1 ? '-' : driver.lapsCompleted}</span>
      {settings.showStint && <span className="col-stint">{driver.stintLaps}</span>}
      <span className={`col-gap ${driver.position === 1 ? 'gap--leader' : ''}`}>
        {fmtGap(driver.gapToLeaderSec, driver.position)}
      </span>
      {settings.showAvgLapTime && <span className="col-avg">{fmtLapTime(driver.avgLapTimeSec)}</span>}
      {settings.showBestLapTime && <span className={`col-best ${driver.isClassFastestLap ? 'col-best--fastest' : ''}`}>{fmtLapTime(driver.bestLapTime)}</span>}
    </div>
  )
}

function ClassBlock({ cls, settings }: { cls: StandingsClass; settings: StandingsOverlaySettings }) {
  const template = gridTemplate(settings)

  return (
    <div className="standings-class">
      <div className="class-header">
        <span className="class-name">{cls.className}</span>
        <span className="class-meta">{m.classMeta(cls.driverCount, cls.strengthOfField)}</span>
      </div>

      <div className="col-labels" style={{ gridTemplateColumns: template }}>
        <span className="col-pos">{m.columnPosition}</span>
        <span className="col-num">{m.columnNumber}</span>
        <span className="col-name">{m.columnDriver}</span>
        {settings.showIRating && <span className="col-irating">{m.columnIRating}</span>}
        {settings.showSafetyRating && <span className="col-sr">{m.columnSafetyRating}</span>}
        <span className="col-lap">{m.columnLap}</span>
        {settings.showStint && <span className="col-stint">{m.columnStint}</span>}
        <span className="col-gap">{m.columnGap}</span>
        {settings.showAvgLapTime && <span className="col-avg">{m.columnAvgLap}</span>}
        {settings.showBestLapTime && <span className="col-best">{m.columnBest}</span>}
      </div>

      <div className="drivers">
        {cls.drivers.map((d, i) => {
          // When positions are hidden (e.g. top 3 shown, then the field around the player),
          // a separator indicates that drivers are intentionally hidden rather than rows being missing.
          const prev = cls.drivers[i - 1]
          const skipped = prev && d.position - prev.position > 1
          return (
            <Fragment key={d.carIdx}>
              {skipped && <div className="driver-gap">⋮</div>}
              <DriverRow driver={d} settings={settings} template={template} />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

export function StandingsOverlay({ data, settings }: { data: StandingsData; settings: StandingsOverlaySettings }) {
  return (
    <div className="standings">
      <div className="header">
        <span className="header-title">{data.trackName}</span>
        <span className="header-session_type">{data.sessionType.charAt(0).toUpperCase()}</span>
        <span className="header-track"><span className="header-data-name">⏱</span> {fmtSessionTime(data.remainingTimeSecs)}</span>
        <span className="header-track"><span className="header-data-name">☁</span> {fmtTemp(data.airTemp, data.airTempUnit)}</span>
        <span className="header-track"><span className="header-data-name">🌡</span> {fmtTemp(data.trackTemp, data.trackTempUnit)}</span>
        <span className="header-track"><span className="header-data-name">{m.gripLabel}</span> {fmtGrip(data.grip)}</span>
      </div>

      {data.classes.map((cls) => (
        <ClassBlock key={cls.classId} cls={cls} settings={settings} />
      ))}
    </div>
  )
}
