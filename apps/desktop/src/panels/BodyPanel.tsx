import { BODY_PRESETS } from '../state/presets'
import { useStore } from '../state/store'
import type { BodySliders } from '../types/scene'
import { PresetCard } from '../ui/PresetCard'
import { Slider } from '../ui/Slider'

interface SliderSpec {
  key: keyof BodySliders
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

/** Overall group only in Phase 1. Ranges cover every seed preset with headroom. */
const OVERALL_SLIDERS: readonly SliderSpec[] = [
  { key: 'height', label: 'Height', min: 0.8, max: 2.3, step: 0.01, unit: 'm' },
  { key: 'mass', label: 'Mass', min: 0, max: 1, step: 0.01 },
  { key: 'muscle', label: 'Muscle', min: 0, max: 1, step: 0.01 },
  { key: 'softness', label: 'Softness', min: 0, max: 1, step: 0.01 },
  { key: 'shoulderHipRatio', label: 'Shoulder : hip', min: 0.85, max: 1.7, step: 0.01 },
]

export function BodyPanel() {
  const body = useStore((s) => s.body)
  const applyPreset = useStore((s) => s.applyPreset)
  const setBodySlider = useStore((s) => s.setBodySlider)
  const endGesture = useStore((s) => s.endGesture)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-200">Body</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {BODY_PRESETS.map((p) => (
          <PresetCard
            key={p.id}
            name={p.name}
            height={p.sliders.height}
            active={body.presetId === p.id}
            modified={body.modifiedFrom !== null}
            onClick={() => applyPreset(p.id)}
          />
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Overall</h3>
        {OVERALL_SLIDERS.map((spec) => (
          <Slider
            key={spec.key}
            label={spec.label}
            value={body.sliders[spec.key]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            unit={spec.unit}
            onChange={(v, preview) => setBodySlider(spec.key, v, { preview })}
            onCommit={endGesture}
          />
        ))}
      </div>
    </section>
  )
}
