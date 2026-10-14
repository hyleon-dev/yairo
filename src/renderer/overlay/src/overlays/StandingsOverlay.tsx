import { Fragment } from 'react'
import {
  SIM_FEATURES,
  type DriverStanding,
  type StandingsClass,
  type StandingsData,
  type StandingsOverlaySettings
} from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { classPositionGradient, licBadgeStyle } from '../sdkColors'
import { manufacturerLogoDataUri } from '../manufacturerLogos/registry'
import './StandingsOverlay.css'
import { iRating } from '../overlay-elements'
import {Clock, Earth, Flag, Road, RotateCw, ThermometerSun} from "lucide-react";

const m = messages.standings

// The iRating/SR columns can be toggled independently (see OverlaySettingsPanel.tsx).
// Grid column widths are computed, not fixed in CSS. This keeps the header and
// data rows aligned for every combination.
function gridTemplate(settings: StandingsOverlaySettings): string {
  const cols = ['22px', '32px']
  if (settings.showNationFlag) cols.push('18px')
  if (settings.showManufacturerLogo) cols.push('24px')
  cols.push('1fr')
  // iRating and its change (when shown) share a single cell (see iRating() below).
  // They are not two separate grid columns. So this stays one push, just wider
  // when the change badge needs room.
  if (settings.showIRating) cols.push(settings.showIRatingChange ? '82px' : '42px')
  if (settings.showSafetyRating) cols.push('54px')
  cols.push('32px')
  if (settings.showStint) cols.push('40px')
  cols.push('70px')
  if (settings.showAvgLapTime) cols.push('70px')
  if (settings.showBestLapTime) cols.push('80px')
  if (settings.showLastLapTime) cols.push('80px')
  if (settings.showPitStops) cols.push('28px')
  if (settings.showPenalties) cols.push('18px')
  return cols.join(' ')
}

function fmtGap(gap: number, position: number, lapsDown: number): string {
  if (position === 1) return m.leader
  if (lapsDown > 0) return `${lapsDown}L`
  if (gap <= 0) return '--:--.--'
  return `+${gap.toFixed(3)}`
}

function fmtTemp(temp: number, unit: string): string {
  return `${temp.toFixed(0)}°${unit}`
}

function fmtRacingTime(secs: number, fractionsSecs: number, padSecs: number, padMins: number, useHours = false): string {
  if (secs <= 0) return '–'
  const h = useHours ? Math.floor(secs / 3600) : 0
  const m = (Math.floor((secs - (h * 3600)) / 60)).toFixed(0).padStart(padMins, '0')
  const s = (secs % 60).toFixed(fractionsSecs).padStart(padSecs, '0')
  return `${h != 0 ? `${h}:` : ''}${m}:${s}`
}

function fmtLapTime(secs: number): string {
  return fmtRacingTime(secs, 3, 6, 1)
}

function fmtSessionTime(secs: number): string {
  return fmtRacingTime(secs, 0, 2, 2, true)
}

function fmtLapsRemaining(laps: number | null): string {
  return laps === null ? '–' : `${Math.ceil(laps)}`
}

function fmtGrip(grip: string): string {

  switch (grip.toLowerCase()) {
    case 'moderately low usage': return 'FAIRLY LOW'
    case 'moderately high usage': return 'FAIRLY HIGH'
    case 'maximum usage': return 'MAX'
    default: return grip.toUpperCase().replace(' USAGE', '')
  }
}

function ManufacturerLogo({ logoKey }: { logoKey: string | null }) {
  const src = manufacturerLogoDataUri(logoKey)
  return <span className="col-manufacturer">{src && <img src={src} alt="" />}</span>
}

// ===================================
// === Class Columns / Driver Data Row
// ===================================
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
      {settings.showNationFlag && (
        <span className="col-flag">{driver.flagIsoCode && <span className={`fi fi-${driver.flagIsoCode}`} />}</span>
      )}
      {settings.showManufacturerLogo && <ManufacturerLogo logoKey={driver.manufacturerLogoKey} />}
      <span className="col-name">{driver.driverName}</span>
      {settings.showIRating && iRating({ driver, settings })}
      {settings.showSafetyRating && (
        <span className="col-sr" style={driver.licColorHex ? licBadgeStyle(driver.licColorHex) : undefined}>
          {driver.licString || '-'}
        </span>
      )}
      <span className="col-driver-current-lap">{driver.lapsCompleted == -1 ? '-' : driver.lapsCompleted}</span>
      {settings.showStint && <span className="col-stint">{driver.stintLaps}</span>}
      <span className={`col-gap ${driver.position === 1 ? 'gap--leader' : ''}`}>
        {fmtGap(driver.gapToLeaderSec, driver.position, driver.lapsDown)}
      </span>
      {settings.showAvgLapTime && <span className="col-avg">{fmtLapTime(driver.avgLapTimeSec)}</span>}
      {settings.showBestLapTime && <span className={`col-lap ${driver.isClassFastestLap ? 'col-lap--class-fastest' : ''}`}>{fmtLapTime(driver.bestLapTime)}</span>}
      {settings.showLastLapTime && <span className={`col-lap ${driver.lastLapTime != -1 && driver.lastLapTime == driver.bestLapTime ? 'col-lap--fastest' : ''}`}>{fmtLapTime(driver.lastLapTime)}</span>}
      {settings.showPitStops && <span className="col-count">{driver.pitStops ?? '–'}</span>}
      {settings.showPenalties && (
        <span className="col-penalty">{driver.penalties ? <Flag className="penalty-flag" /> : null}</span>
      )}
    </div>
  )
}

// ===================================
// === Class Header / Labels
// ===================================
function ColumnLabels({ settings, template }: { settings: StandingsOverlaySettings; template: string }) {
  return (
    <div className="col-labels" style={{ gridTemplateColumns: template }}>
      <span className="col-pos">{m.columnPosition}</span>
      <span className="col-num">{m.columnNumber}</span>
      {settings.showNationFlag && <span className="col-flag" />}
      {settings.showManufacturerLogo && <span className="col-manufacturer" />}
      <span className="col-name">{m.columnDriver}</span>
      {settings.showIRating && <span className="col-irating">{m.columnIRating}</span>}
      {settings.showSafetyRating && <span className="col-sr">{m.columnSafetyRating}</span>}
      <span className="col-driver-current-lap">{m.columnLap}</span>
      {settings.showStint && <span className="col-stint">{m.columnStint}</span>}
      <span className="col-gap">{m.columnGap}</span>
      {settings.showAvgLapTime && <span className="col-avg">{m.columnAvgLap}</span>}
      {settings.showBestLapTime && <span className="col-lap">{m.columnBest}</span>}
      {settings.showLastLapTime && <span className="col-lap">{m.columnLast}</span>}
      {settings.showPitStops && <span className="col-count">{m.columnPitStops}</span>}
      {settings.showPenalties && <span className="col-penalty" />}
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

      <ColumnLabels settings={settings} template={template} />

      <div className="drivers">
        {cls.drivers.map((d, i) => {
          // Positions can be hidden, for example top 3 shown, then the field around the player.
          // A separator then shows that drivers are hidden on purpose, not missing rows.
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

function PlaceholderRow({
  position,
  settings,
  template
}: {
  position: number
  settings: StandingsOverlaySettings
  template: string
}) {
  return (
    <div className="driver-row driver-row--placeholder" style={{ gridTemplateColumns: template }}>
      <span className="col-pos">{position}</span>
      <span className="col-num">–</span>
      {settings.showNationFlag && <span className="col-flag" />}
      {settings.showManufacturerLogo && <span className="col-manufacturer" />}
      <span className="col-name">–</span>
      {settings.showIRating && <span className="col-irating">–</span>}
      {settings.showSafetyRating && <span className="col-sr">–</span>}
      <span className="col-driver-current-lap">–</span>
      {settings.showStint && <span className="col-stint">–</span>}
      <span className="col-gap">–</span>
      {settings.showAvgLapTime && <span className="col-avg">–</span>}
      {settings.showBestLapTime && <span className="col-lap">–</span>}
      {settings.showLastLapTime && <span className="col-lap">–</span>}
      {settings.showPitStops && <span className="col-count">–</span>}
      {settings.showPenalties && <span className="col-penalty" />}
    </div>
  )
}

// Shown only when there's no class data at all:
// Fills the configured top slots with empty rows.
// Must NOT kick in once real (even partial) data exists.
function EmptyClassBlock({ settings }: { settings: StandingsOverlaySettings }) {
  const template = gridTemplate(settings)

  return (
    <div className="standings-class">
      <ColumnLabels settings={settings} template={template} />
      <div className="drivers">
        {Array.from({ length: Math.max(0, settings.topCount) }, (_, i) => (
          <PlaceholderRow key={i} position={i + 1} settings={settings} template={template} />
        ))}
      </div>
    </div>
  )
}

// ===================================
// === Overlay Header
// ===================================
export function StandingsOverlay({ data, settings: userSettings }: { data: StandingsData; settings: StandingsOverlaySettings }) {
  const features = SIM_FEATURES[data.sim]
  const settings = {
    ...userSettings,
    ...(!features.driverRatings && { showIRating: false, showIRatingChange: false, showSafetyRating: false }),
    ...(!features.pitStopCounts && { showPitStops: false }),
    ...(!features.penaltyFlags && { showPenalties: false })
  }

  return (
    <div className="standings">
      <div className="header">
        <span className="header-title">{data.trackName}</span>
        <span className="header-session_type">{data.sessionType.charAt(0).toUpperCase()}</span>
        <span className="header-data"><Clock className="header-icon" /> {fmtSessionTime(data.remainingTimeSecs)}</span>
        {data.lapsRemaining != null && <span className="header-data"><Flag className="header-icon" /> ~{fmtLapsRemaining(data.lapsRemaining)}L</span>}
        <span className="header-data"><ThermometerSun className="header-icon" /> {fmtTemp(data.airTemp, data.airTempUnit)}</span>
        <span className="header-data"><Road className="header-icon" /> {fmtTemp(data.trackTemp, data.trackTempUnit)}</span>
        {features.trackGrip && (
          <span className="header-data"><span className="header-data-name">{m.gripLabel}</span> {fmtGrip(data.grip)}</span>
        )}
        {settings.showRealTime && (
          <>
            <span className="overlay-spacer"/>
            <span className="header-data"><Earth className="header-icon" /> {new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
          </>
        )}
      </div>

      {data.classes.length === 0 ? (
        <EmptyClassBlock settings={settings} />
      ) : (
        data.classes.map((cls) => <ClassBlock key={cls.classId} cls={cls} settings={settings} />)
      )}
    </div>
  )
}
