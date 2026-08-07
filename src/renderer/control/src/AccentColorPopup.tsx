import { useState } from 'react'
import { HexColorInput, HexColorPicker } from 'react-colorful'
import { DEFAULT_ACCENT_COLOR } from '../../../shared/types'
import { hexToRgb, rgbToHex, type RgbColor } from '../../../shared/color'
import { messages } from '../../../shared/messages'
import { NumberInput } from './Elements'

const m = messages.accentColor

interface Props {
  // Color that was active when the popup was opened, restored on cancel.
  initialColor: string
  // Called on every change, for the live preview on all windows.
  onPreview: (hex: string) => void
  onSave: () => void
  onCancel: () => void
}

export function AccentColorPopup({ initialColor, onPreview, onSave, onCancel }: Props) {
  const [color, setColor] = useState(initialColor)

  const applyColor = (hex: string) => {
    setColor(hex)
    onPreview(hex)
  }

  const rgb = hexToRgb(color)
  const applyRgb = (patch: Partial<RgbColor>) => applyColor(rgbToHex({ ...rgb, ...patch }))

  const handleCancel = () => {
    onPreview(initialColor)
    onCancel()
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal accent-color-popup" onClick={(e) => e.stopPropagation()}>
        <h3>{m.title}</h3>

        <HexColorPicker color={color} onChange={applyColor} />

        <div className="accent-color-field">
          <label>
            <span>R</span>
            <NumberInput value={rgb.r} min={0} max={255} onChange={(v) => applyRgb({ r: v })} />
          </label>
          <label>
            <span>G</span>
            <NumberInput value={rgb.g} min={0} max={255} onChange={(v) => applyRgb({ g: v })} />
          </label>
          <label>
            <span>B</span>
            <NumberInput value={rgb.b} min={0} max={255} onChange={(v) => applyRgb({ b: v })} />
          </label>
          <label className="accent-color-hex">
            <span>{m.hexLabel}</span>
            <HexColorInput color={color} onChange={applyColor} prefixed />
          </label>
        </div>

        <div className="accent-color-actions">
          <button type="button" className="secondary-btn" onClick={() => applyColor(DEFAULT_ACCENT_COLOR)}>
            {m.resetToDefault}
          </button>
          <div className="accent-color-actions-spacer" />
          <button type="button" className="secondary-btn" onClick={handleCancel}>
            {m.cancel}
          </button>
          <button type="button" onClick={onSave}>
            {m.save}
          </button>
        </div>
      </div>
    </div>
  )
}
