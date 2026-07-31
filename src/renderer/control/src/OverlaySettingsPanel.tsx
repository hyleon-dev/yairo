import type {
  AnyOverlaySettings,
  FlagsOverlaySettings,
  OverlayConfig,
  RelativeOverlaySettings,
  StandingsOverlaySettings,
  StintOverlaySettings,
  TelemetryOverlaySettings,
  TiresOverlaySettings
} from '../../../shared/types'
import { messages } from '../../../shared/messages'

const m = messages.overlaySettings

interface Props {
  overlay: OverlayConfig
  settings: AnyOverlaySettings | undefined
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}

// Every overlay has at least the "scale" setting (size in %).
// Overlay-specific settings (e.g. driver count for the Relative overlay) are
// added here based on overlay.id.
export function OverlaySettingsPanel({ overlay, settings, onChange }: Props) {
  if (!settings) return null

  return (
    <div className="overlay-settings">
      <label className="setting-row">
        <span>{m.scale}</span>
        <input
          type="number"
          min={50}
          max={200}
          step={5}
          value={Math.round(settings.scale * 100)}
          onChange={(e) => onChange({ scale: Number(e.target.value) / 100 })}
        />
        <span className="unit-suffix">{m.scaleUnit}</span>
      </label>

      {overlay.id === 'relative' && (
        <RelativeSettings settings={settings as RelativeOverlaySettings} onChange={onChange} />
      )}

      {overlay.id === 'standings' && (
        <StandingsSettings settings={settings as StandingsOverlaySettings} onChange={onChange} />
      )}

      {overlay.id === 'tires' && (
        <TiresSettings settings={settings as TiresOverlaySettings} onChange={onChange} />
      )}

      {overlay.id === 'telemetry' && (
        <TelemetrySettings settings={settings as TelemetryOverlaySettings} onChange={onChange} />
      )}

      {overlay.id === 'flags' && (
        <FlagsSettings settings={settings as FlagsOverlaySettings} onChange={onChange} />
      )}
    </div>
  )
}

function RelativeSettings({
  settings,
  onChange
}: {
  settings: RelativeOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <>
      <label className="setting-row">
        <span>{m.driversAhead}</span>
        <input
          type="number"
          min={0}
          max={10}
          value={settings.driversAhead}
          onChange={(e) => onChange({ driversAhead: Number(e.target.value) })}
        />
      </label>
      <label className="setting-row">
        <span>{m.driversBehind}</span>
        <input
          type="number"
          min={0}
          max={10}
          value={settings.driversBehind}
          onChange={(e) => onChange({ driversBehind: Number(e.target.value) })}
        />
      </label>
      <DriverRatingSettings settings={settings} onChange={onChange} />
      <StintSettings settings={settings} onChange={onChange} />
    </>
  )
}

function StandingsSettings({
  settings,
  onChange
}: {
  settings: StandingsOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <>
      <label className="setting-row">
        <span>{m.topCount}</span>
        <input
          type="number"
          min={0}
          max={10}
          value={settings.topCount}
          onChange={(e) => onChange({ topCount: Number(e.target.value) })}
        />
      </label>
      <label className="setting-row">
        <span>{m.driversAhead}</span>
        <input
          type="number"
          min={0}
          max={10}
          value={settings.driversAhead}
          onChange={(e) => onChange({ driversAhead: Number(e.target.value) })}
        />
      </label>
      <label className="setting-row">
        <span>{m.driversBehind}</span>
        <input
          type="number"
          min={0}
          max={10}
          value={settings.driversBehind}
          onChange={(e) => onChange({ driversBehind: Number(e.target.value) })}
        />
      </label>
      <DriverRatingSettings settings={settings} onChange={onChange} />
      <StintSettings settings={settings} onChange={onChange} />
    </>
  )
}

// iR/SR are toggleable independently in both Standings AND Relative.
// Both settings types share the same two fields (DriverRatingOverlaySettings),
// hence one shared small panel for both.
function DriverRatingSettings({
  settings,
  onChange
}: {
  settings: RelativeOverlaySettings | StandingsOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <>
      <label className="setting-row">
        <span>{m.showIRating}</span>
        <input
          type="checkbox"
          checked={settings.showIRating}
          onChange={(e) => onChange({ showIRating: e.target.checked })}
        />
      </label>
      <label className="setting-row">
        <span>{m.showSafetyRating}</span>
        <input
          type="checkbox"
          checked={settings.showSafetyRating}
          onChange={(e) => onChange({ showSafetyRating: e.target.checked })}
        />
      </label>
    </>
  )
}

function TiresSettings({
  settings,
  onChange
}: {
  settings: TiresOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <label className="setting-row">
      <span>{m.showWearPct}</span>
      <input
        type="checkbox"
        checked={settings.showWearPct}
        onChange={(e) => onChange({ showWearPct: e.target.checked })}
      />
    </label>
  )
}

function TelemetrySettings({
  settings,
  onChange
}: {
  settings: TelemetryOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <label className="setting-row">
      <span>{m.showRpmNumber}</span>
      <input
        type="checkbox"
        checked={settings.showRpmNumber}
        onChange={(e) => onChange({ showRpmNumber: e.target.checked })}
      />
    </label>
  )
}

function FlagsSettings({
  settings,
  onChange
}: {
  settings: FlagsOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <label className="setting-row">
      <span>{m.showLabel}</span>
      <input
        type="checkbox"
        checked={settings.showLabel}
        onChange={(e) => onChange({ showLabel: e.target.checked })}
      />
    </label>
  )
}

function StintSettings({
  settings,
  onChange
}: {
  settings: StintOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
    <label className="setting-row">
      <span>{m.showStint}</span>
      <input
        type="checkbox"
        checked={settings.showStint}
        onChange={(e) => onChange({ showStint: e.target.checked })}
      />
    </label>
  )
}
