import type {DriverStanding, RelativeDriver, RelativeOverlaySettings, StandingsOverlaySettings} from "../../../shared/types";

// Round indicator light with a label "punched out" as a dark negative,
// lights up in the given color when active. Outline stays visible when off.
export function HintLed({ label, active, color }: { label: string; active: boolean; color: 'blue' | 'red' }) {
  return (
    <div className={`hint-led hint-led--${color} ${active ? 'hint-led--lit' : ''}`}>
      <span className="hint-led-text">{label}</span>
    </div>
  )
}

export function iRating({ driver, settings }: { driver: DriverStanding | RelativeDriver; settings: StandingsOverlaySettings | RelativeOverlaySettings }) {
  if (!settings.showIRating) return null
  if (driver.iRating <= 0) return <span className="col-irating">-</span>
  const display = driver.iRating

  if (settings.showIRatingChange && driver.iRatingChange != null) {

    const rounded = Math.round(driver.iRatingChange)
    const sign = rounded > 0 ? '+' : ''
    const cls = rounded > 0 ? 'col-irchange--up' : rounded < 0 ? 'col-irchange--down' : ''

    return (
        <span className="col-irating">
        <span className="col-irating-value">{display}</span>
        <span className={`col-irchange ${cls}`}>{sign}{rounded}</span>
      </span>
    )
  } else {
    return <span className="col-irating"><span className="col-irating-value">{display}</span></span>
  }
}