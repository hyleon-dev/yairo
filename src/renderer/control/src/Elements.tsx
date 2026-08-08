import { useEffect, useRef, type RefObject } from 'react'

function useWheelStep(
    ref: RefObject<HTMLInputElement>,
    value: number,
    step: number,
    min: number | undefined,
    max: number | undefined,
    onChange: (value: number) => void
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return
      e.preventDefault()
      const next = value + (e.deltaY < 0 ? step : -step)
      onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)))
    }

    el.addEventListener('wheel', handleWheel, {passive: false})
    return () => el.removeEventListener('wheel', handleWheel)
  }, [ref, value, step, min, max, onChange])
}

export function ToggleSwitch(
    {checked, onChange, label}:
    { checked: boolean, onChange: (checked: boolean) => void, label: string }
) {
  return (
      <label className="checkbox-slide">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/>
        <span className="checkbox-slide__box"></span>
        <span className="checkbox-slide__label">{label}</span>
      </label>
  );
}

export function NumberInput(
    {value, min, max, step = 1, onChange}:
    { value: number, min?: number, max?: number, step?: number, onChange: (value: number) => void }
) {
  const ref = useRef<HTMLInputElement>(null)
  useWheelStep(ref, value, step, min, max, onChange)

  return (
      <span className="input-wrap">
      <input
          ref={ref}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
      />
      </span>
  )
}

export function SuffixNumberInput(
    {value, suffix, min, max, step = 1, onChange}:
    { value: number, suffix: string, min?: number, max?: number, step?: number, onChange: (value: number) => void }
) {
  const ref = useRef<HTMLInputElement>(null)
  useWheelStep(ref, value, step, min, max, onChange)

  return (
      <span className="input-suffix-wrap">
      <input
          ref={ref}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="input-suffix">{suffix}</span>
    </span>
  )
}