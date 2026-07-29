import type { RelativeData, RelativeDriver, RelativeOverlaySettings } from '../../../../shared/types'
import { messages } from '../../../../shared/messages'
import { classPositionGradient, licBadgeStyle } from '../sdkColors'
import './RelativeOverlay.css'

const m = messages.relative

// The iRating/SR columns are toggleable independently (see OverlaySettingsPanel.tsx),
// grid column widths are computed instead of fixed in CSS, so the header and
// data rows stay aligned regardless of combination.
function gridTemplate(settings: RelativeOverlaySettings): string {
  const cols = ['22px', '32px', '1fr']
  if (settings.showIRating) cols.push('42px')
  if (settings.showSafetyRating) cols.push('54px')
  cols.push('32px')
  if (settings.showStint) cols.push('40px')
  cols.push('56px')
  return cols.join(' ')
}

function fmtGap(gap: number, isPlayer: boolean): string {
  if (isPlayer) return '–'
  const sign = gap > 0 ? '+' : ''
  return `${sign}${gap.toFixed(1)}`
}

function fmtLap(lap: number): string {
  if (lap === -1) return '–'
  return `L${lap}`
}

function DriverRow({
  driver,
  settings,
  template
}: {
  driver: RelativeDriver
  settings: RelativeOverlaySettings
  template: string
}) {
  const rowClass = [
    'rel-row',
    driver.isPlayer && 'rel-row--player',
    driver.lapsDifference !== 0 && 'rel-row--lapped'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rowClass} style={{ gridTemplateColumns: template }}>
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
      <span className="col-lap">{fmtLap(driver.lap)}</span>
      {settings.showStint && <span className="col-stint">{driver.stintLaps}</span>}
      <span className="col-gap">{fmtGap(driver.gapToPlayerSec, driver.isPlayer)}</span>
    </div>
  )
}

// If fewer drivers are currently on track ahead/behind the player than
// configured (driversAhead/driversBehind), the window should NOT shrink.
// Instead, placeholder rows fill missing slots instead.
// Real drivers always take priority, so placeholders always end up on the outside (top for missing
// "ahead" drivers, bottom for missing "behind" drivers).
function PlaceholderRow({ settings, template }: { settings: RelativeOverlaySettings; template: string }) {
  return (
    <div className="rel-row rel-row--placeholder" style={{ gridTemplateColumns: template }}>
      <span className="col-pos">–</span>
      <span className="col-num">–</span>
      <span className="col-name">–</span>
      {settings.showIRating && <span className="col-irating">–</span>}
      {settings.showSafetyRating && <span className="col-sr">–</span>}
      <span className="col-lap">–</span>
      {settings.showStint && <span className="col-stint">–</span>}
      <span className="col-gap">–</span>
    </div>
  )
}

export function RelativeOverlay({ data, settings }: { data: RelativeData; settings: RelativeOverlaySettings }) {
  const template = gridTemplate(settings)

  const playerIndex = data.drivers.findIndex((d) => d.isPlayer)
  const actualAhead = playerIndex === -1 ? 0 : playerIndex
  const actualBehind = playerIndex === -1 ? 0 : data.drivers.length - playerIndex - 1
  const missingAhead = Math.max(0, settings.driversAhead - actualAhead)
  const missingBehind = Math.max(0, settings.driversBehind - actualBehind)

  return (
    <div className="relative">
      <div className="col-labels" style={{ gridTemplateColumns: template }}>
        <span className="col-pos">{m.columnPosition}</span>
        <span className="col-num">{m.columnNumber}</span>
        <span className="col-name">{m.columnDriver}</span>
        {settings.showIRating && <span className="col-irating">{m.columnIRating}</span>}
        {settings.showSafetyRating && <span className="col-sr">{m.columnSafetyRating}</span>}
        <span className="col-lap">{m.columnLap}</span>
        {settings.showStint && <span className="col-stint">{m.columnStint}</span>}
        <span className="col-gap">{m.columnGap}</span>
      </div>

      <div className="rel-drivers">
        {Array.from({ length: missingAhead }, (_, i) => (
          <PlaceholderRow key={`ahead-${i}`} settings={settings} template={template} />
        ))}
        {data.drivers.map((d) => (
          <DriverRow key={d.carIdx} driver={d} settings={settings} template={template} />
        ))}
        {Array.from({ length: missingBehind }, (_, i) => (
          <PlaceholderRow key={`behind-${i}`} settings={settings} template={template} />
        ))}
      </div>
    </div>
  )
}
