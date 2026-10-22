import { useEffect, useState } from 'react'

export interface SliderProps {
  label: string
  /** Value in state units (radians for angles). */
  value: number
  /** Bounds and step in display units (degrees for angles). */
  min: number
  max: number
  step: number
  unit?: string
  decimals?: number
  /** State -> display conversion, e.g. radToDeg. Defaults to identity. */
  toDisplay?: (v: number) => number
  fromDisplay?: (v: number) => number
  /** Called with preview=true during a drag and preview=false for a typed value. */
  onChange: (value: number, preview: boolean) => void
  /** Drag released; ends the undo gesture. */
  onCommit: () => void
  /** Locked controls show their value but cannot change. */
  disabled?: boolean
}

const identity = (v: number): number => v

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 2,
  toDisplay = identity,
  fromDisplay = identity,
  onChange,
  onCommit,
  disabled = false,
}: SliderProps) {
  const shown = toDisplay(value)
  const [draft, setDraft] = useState(shown.toFixed(decimals))
  useEffect(() => setDraft(shown.toFixed(decimals)), [shown, decimals])

  const commitDraft = (): void => {
    const n = Number(draft)
    if (Number.isFinite(n)) onChange(fromDisplay(n), false)
    else setDraft(shown.toFixed(decimals))
  }

  return (
    <label className={`block select-none py-1 text-xs ${disabled ? 'opacity-50' : ''}`}>
      <div className="mb-0.5 flex items-center justify-between text-neutral-400">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <input
            className="w-16 rounded bg-neutral-800 px-1 py-0.5 text-right text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => e.key === 'Enter' && commitDraft()}
          />
          {unit && <span className="w-6 text-neutral-500">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-sky-500"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, shown))}
        disabled={disabled}
        onChange={(e) => onChange(fromDisplay(Number(e.target.value)), true)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
    </label>
  )
}
