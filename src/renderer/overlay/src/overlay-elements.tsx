import type {DriverStanding, RelativeDriver, RelativeOverlaySettings, StandingsOverlaySettings} from "../../../shared/types";


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