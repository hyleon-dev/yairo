import type {
  AnyOverlaySettings,
  AvgLapTimeOverlaySettings, BestLapTimeOverlaySettings,
  FlagsOverlaySettings,
  LapTimerOverlaySettings,
  OverlayConfig,
  RelativeOverlaySettings,
  StandingsOverlaySettings,
  StintOverlaySettings,
  TelemetryOverlaySettings,
  TiresOverlaySettings
} from '../../../shared/types'
import {messages} from '../../../shared/messages'
import {ToggleSwitch, SuffixNumberInput, NumberInput} from "./Elements";

const m = messages.overlaySettings

interface Props {
  overlay: OverlayConfig
  settings: AnyOverlaySettings | undefined
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}

// Every overlay has at least the "scale" setting (size in %).
// Overlay-specific settings (e.g. driver count for the Relative overlay) are
// added here based on overlay.id.
export function OverlaySettingsPanel({overlay, settings, onChange}: Props) {
  if (!settings) return null

  return (
      <div className="overlay-settings-root">
        <span className="multi-settings-row">
          <label className="overlay-setting">
            <SuffixNumberInput
                value={Math.round(settings.scale * 100)}
                suffix={m.scaleUnit}
                min={50}
                max={200}
                step={5}
                onChange={(value) => onChange({scale: value / 100})}
            />
            <span className="overlay-setting-label">{m.scale}</span>
          </label>
          <label className="overlay-setting">
            <SuffixNumberInput
                value={Math.round(settings.opacity * 100)}
                suffix={m.opacityUnit}
                min={0}
                max={100}
                step={5}
                onChange={(value) => onChange({opacity: value / 100})}
            />
            <span className="overlay-setting-label">{m.opacity}</span>
          </label>
        </span>

        {overlay.id === 'relative' && (
            <RelativeSettings settings={settings as RelativeOverlaySettings} onChange={onChange}/>
        )}

        {overlay.id === 'standings' && (
            <StandingsSettings settings={settings as StandingsOverlaySettings} onChange={onChange}/>
        )}

        {overlay.id === 'tires' && (
            <TiresSettings settings={settings as TiresOverlaySettings} onChange={onChange}/>
        )}

        {overlay.id === 'telemetry' && (
            <TelemetrySettings settings={settings as TelemetryOverlaySettings} onChange={onChange}/>
        )}

        {overlay.id === 'flags' && (
            <FlagsSettings settings={settings as FlagsOverlaySettings} onChange={onChange}/>
        )}

        {overlay.id === 'lap-timer' && (
            <LapTimerSettings settings={settings as LapTimerOverlaySettings} onChange={onChange}/>
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
      <span className="multi-settings-row">
      <label className="overlay-setting">
        <NumberInput
            min={0}
            max={10}
            value={settings.driversAhead}
            onChange={(value) => onChange({driversAhead: value})}
        />
        <span className="overlay-setting-label">{m.driversAhead}</span>
      </label>
      <label className="overlay-setting">
        <NumberInput
            min={0}
            max={10}
            value={settings.driversBehind}
            onChange={(value) => onChange({driversBehind: value})}
        />
        <span className="overlay-setting-label">{m.driversBehind}</span>
      </label>
      </span>
        <span className="multi-settings-row">
      <DriverRatingSettings settings={settings} onChange={onChange}/>
      </span>
        <StintSettings settings={settings} onChange={onChange}/>
        <AvgLapTimeSettings settings={settings} onChange={onChange}/>
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
      <span className="multi-settings-row">
        <label className="overlay-setting">
        <NumberInput
            min={0}
            max={10}
            value={settings.topCount}
            onChange={(value) => onChange({topCount: value})}
        />
        <span className="overlay-setting-label">{m.topCount}</span>
      </label>
      <label className="overlay-setting">
        <NumberInput
            min={0}
            max={10}
            value={settings.driversAhead}
            onChange={(value) => onChange({driversAhead: value})}
        />
        <span className="overlay-setting-label">{m.driversAhead}</span>
      </label>
      <label className="overlay-setting">
        <NumberInput
            min={0}
            max={10}
            value={settings.driversBehind}
            onChange={(value) => onChange({driversBehind: value})}
        />
        <span className="overlay-setting-label">{m.driversBehind}</span>
      </label>
      </span>
        <span className="multi-settings-row">
          <DriverRatingSettings settings={settings} onChange={onChange}/>
        </span>
        <StintSettings settings={settings} onChange={onChange}/>
        <span className="multi-settings-row">
          <AvgLapTimeSettings settings={settings} onChange={onChange}/>
          <BestLapTimeSettings settings={settings} onChange={onChange}/>
        </span>
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
        <ToggleSwitch
            checked={settings.showIRating}
            onChange={(checked) => onChange({showIRating: checked})}
            label={m.showIRating}
        />
        <ToggleSwitch
            checked={settings.showSafetyRating}
            onChange={(checked) => onChange({showSafetyRating: checked})}
            label={m.showSafetyRating}
        />
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
      <ToggleSwitch
          checked={settings.showWearPct}
          onChange={(checked) => onChange({showWearPct: checked})}
          label={m.showWearPct}
      />
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
      <ToggleSwitch
          checked={settings.showRpmNumber}
          onChange={(checked) => onChange({showRpmNumber: checked})}
          label={m.showRpmNumber}
      />
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
      <ToggleSwitch
          checked={settings.showLabel}
          onChange={(checked) => onChange({showLabel: checked})}
          label={m.showLabel}
      />
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
      <ToggleSwitch
          checked={settings.showStint}
          onChange={(checked) => onChange({showStint: checked})}
          label={m.showStint}
      />
  )
}

function AvgLapTimeSettings({
                              settings,
                              onChange
                            }: {
  settings: AvgLapTimeOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
      <ToggleSwitch
          checked={settings.showAvgLapTime}
          onChange={(checked) => onChange({showAvgLapTime: checked})}
          label={m.showAvgLapTime}
      />
  )
}

function BestLapTimeSettings({
                               settings,
                               onChange
                             }: {
  settings: BestLapTimeOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  return (
      <ToggleSwitch
          checked={settings.showBestLapTime}
          onChange={(checked) => onChange({showBestLapTime: checked})}
          label={m.showBestLapTime}
      />
  )
}

// Displayed/stored as one total-seconds float (targetLapTimeSec, matching
// every other lap time in the codebase), decomposed into min/sec/ms here
// purely for the three input fields - <= 0 (all three at 0) means "not set".
function LapTimerSettings({
                            settings,
                            onChange
                          }: {
  settings: LapTimerOverlaySettings
  onChange: (patch: Partial<AnyOverlaySettings>) => void
}) {
  const totalMs = Math.max(0, Math.round(settings.targetLapTimeSec * 1000))
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000

  const update = (patch: Partial<{ minutes: number; seconds: number; millis: number }>) => {
    const nextMinutes = patch.minutes ?? minutes
    const nextSeconds = patch.seconds ?? seconds
    const nextMillis = patch.millis ?? millis
    onChange({targetLapTimeSec: nextMinutes * 60 + nextSeconds + nextMillis / 1000})
  }

  return (
      <span className="multi-settings-row target-time-row">
      <label className="overlay-setting">
        <NumberInput min={0} max={999} value={minutes} onChange={(value) => update({minutes: value})}/>
        <span className="overlay-setting-label">:</span>
      </label>
      <label className="overlay-setting">
        <NumberInput min={0} max={59} value={seconds} onChange={(value) => update({seconds: value})}/>
        <span className="overlay-setting-label">.</span>
      </label>
      <label className="overlay-setting">
        <NumberInput min={0} max={999} value={millis} onChange={(value) => update({millis: value})}/>
        <span className="overlay-setting-label">{m.targetTime}</span>
      </label>
      <button
          type="button"
          className="overlay-in-line-button"
          title={m.resetTargetTime}
          aria-label={m.resetTargetTime}
          onClick={() => onChange({targetLapTimeSec: 0})}
      >
        {m.resetTargetTime_short}
      </button>
      </span>
  )
}
