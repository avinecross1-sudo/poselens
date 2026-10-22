import { useState } from 'react'
import {
  ASYMMETRY_SPECS,
  BODY_GROUP_LABELS,
  BODY_GROUPS,
  BODY_SLIDER_SPECS,
  groupLockKey,
  isSliderLocked,
  slidersInGroup,
  asymmetryValue,
  type BodyGroup,
} from '../state/bodySliders'
import { IDENTITY_SCALE, matrixScale } from '../state/bodySlice'
import { BODY_PRESETS, getPreset } from '../state/presets'
import { useStore } from '../state/store'
import { ASYMMETRY_KEYS, type Vec3 } from '../types/scene'
import { LockButton } from '../ui/LockButton'
import { PresetCard } from '../ui/PresetCard'
import { Section, smallBtn } from '../ui/Section'
import { Slider } from '../ui/Slider'
import { Toggle } from '../ui/Toggle'

/** Stylized scale range per axis. */
const STYLIZE_MIN = 0.5
const STYLIZE_MAX = 2
const AXIS_LABELS = ['Width (X)', 'Height (Y)', 'Depth (Z)'] as const

export function BodyPanel() {
  const body = useStore((s) => s.body)
  const customPresets = useStore((s) => s.customPresets)
  const a = useStore((s) => s)
  const allPresets = [...BODY_PRESETS, ...customPresets]

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Body</h2>
        <button type="button" className={smallBtn} onClick={a.resetBody} title="Reset every unlocked slider to the preset">
          Reset all
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400" title="How the figure is drawn in the viewport and in exported PNGs">
        Look
        <Toggle
          options={[
            { value: 'mannequin', label: 'Mannequin' },
            { value: 'anatomy', label: 'Anatomy' },
          ]}
          value={a.figureStyle}
          onChange={a.setFigureStyle}
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {allPresets.map((p) => (
          <div key={p.id} className="relative">
            <PresetCard
              name={p.name}
              height={p.sliders.height}
              active={body.presetId === p.id}
              modified={body.presetId === p.id && body.modifiedFrom === p.id}
              onClick={() => a.applyPreset(p.id)}
            />
            {!getPreset(p.id) && (
              <button
                type="button"
                title="Delete custom preset"
                onClick={() => a.deleteCustomPreset(p.id)}
                className="absolute right-1 top-1 text-[10px] text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {body.modifiedFrom && (
        <p className="text-[11px] text-neutral-500">
          Modified from {getPreset(body.modifiedFrom, customPresets)?.name ?? body.modifiedFrom}
        </p>
      )}

      <PresetBlend />

      {BODY_GROUPS.map((g) => (
        <SliderGroup key={g} group={g} />
      ))}

      <AsymmetrySection />
      <StylizedSection />
    </section>
  )
}

function PresetBlend() {
  const customPresets = useStore((s) => s.customPresets)
  const presetId = useStore((s) => s.body.presetId)
  const blendPresets = useStore((s) => s.blendPresets)
  const endGesture = useStore((s) => s.endGesture)
  const saveCustomPreset = useStore((s) => s.saveCustomPreset)
  const all = [...BODY_PRESETS, ...customPresets]
  const [aId, setA] = useState(BODY_PRESETS[0]?.id ?? 'average')
  const [bId, setB] = useState(BODY_PRESETS[1]?.id ?? 'average')
  const [t, setT] = useState(0)

  const select = (value: string, onChange: (v: string) => void) => (
    <select
      className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200"
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
        setT(0)
      }}
    >
      {all.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )

  return (
    <Section title="Blend presets" defaultOpen={false}>
      <div className="flex items-center gap-1">
        {select(aId, setA)}
        <span className="text-xs text-neutral-500">→</span>
        {select(bId, setB)}
      </div>
      <Slider
        label={`${getPreset(aId, customPresets)?.name ?? aId} → ${getPreset(bId, customPresets)?.name ?? bId}`}
        value={t}
        min={0}
        max={1}
        step={0.01}
        onChange={(v, preview) => {
          setT(v)
          blendPresets(aId, bId, v, { preview })
        }}
        onCommit={endGesture}
      />
      <button
        type="button"
        className="w-full rounded bg-neutral-800 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
        onClick={() => saveCustomPreset(presetId)}
        title='Adds the current body to the preset list as "Modified from …"'
      >
        Save as custom preset
      </button>
    </Section>
  )
}

function SliderGroup({ group }: { group: BodyGroup }) {
  const body = useStore((s) => s.body)
  const setBodySlider = useStore((s) => s.setBodySlider)
  const toggleBodyLock = useStore((s) => s.toggleBodyLock)
  const resetBodyGroup = useStore((s) => s.resetBodyGroup)
  const endGesture = useStore((s) => s.endGesture)
  const groupLocked = Boolean(body.locks[groupLockKey(group)])

  return (
    <Section
      title={BODY_GROUP_LABELS[group]}
      defaultOpen={group === 'proportions'}
      actions={
        <>
          <button type="button" className={smallBtn} onClick={() => resetBodyGroup(group)}>
            Reset
          </button>
          <LockButton locked={groupLocked} onClick={() => toggleBodyLock(groupLockKey(group))} title={groupLocked ? 'Unlock group' : 'Lock group'} />
        </>
      }
    >
      {slidersInGroup(group).map((key) => {
        const spec = BODY_SLIDER_SPECS[key]
        const locked = isSliderLocked(body.locks, key)
        return (
          <div key={key} className="flex items-end gap-1">
            <div className="min-w-0 flex-1">
              <Slider
                label={spec.label}
                value={body.sliders[key]}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                unit={spec.unit}
                decimals={spec.decimals}
                disabled={locked}
                onChange={(v, preview) => setBodySlider(key, v, { preview })}
                onCommit={endGesture}
              />
            </div>
            <div className="pb-1">
              <LockButton locked={Boolean(body.locks[key])} onClick={() => toggleBodyLock(key)} />
            </div>
          </div>
        )
      })}
    </Section>
  )
}

function AsymmetrySection() {
  const asymmetry = useStore((s) => s.body.asymmetry)
  const setAsymmetry = useStore((s) => s.setAsymmetry)
  const resetAsymmetry = useStore((s) => s.resetAsymmetry)
  const endGesture = useStore((s) => s.endGesture)
  const [symmetric, setSymmetric] = useState(false)

  return (
    <Section
      title="Asymmetry"
      defaultOpen={false}
      actions={
        <button type="button" className={smallBtn} onClick={resetAsymmetry}>
          Reset
        </button>
      }
    >
      <label className="flex items-center gap-1 text-xs text-neutral-400">
        <input type="checkbox" checked={symmetric} onChange={(e) => setSymmetric(e.target.checked)} />
        Symmetry (edit both sides together)
      </label>
      {ASYMMETRY_KEYS.map((key) => {
        const spec = ASYMMETRY_SPECS[key]
        return (
          <Slider
            key={key}
            label={spec.label}
            value={asymmetryValue(asymmetry, key)}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            unit={spec.unit}
            decimals={spec.decimals}
            onChange={(v, preview) => setAsymmetry(key, v, symmetric, { preview })}
            onCommit={endGesture}
          />
        )
      })}
    </Section>
  )
}

function StylizedSection() {
  const override = useStore((s) => s.body.stylizedOverride)
  const setStylizedScale = useStore((s) => s.setStylizedScale)
  const acknowledgeStylized = useStore((s) => s.acknowledgeStylized)
  const endGesture = useStore((s) => s.endGesture)
  const scale: Vec3 = override ? matrixScale(override.matrix) : IDENTITY_SCALE

  return (
    <Section title="Stylized override" defaultOpen={Boolean(override)}>
      <p className="mb-1 text-[11px] text-neutral-500">
        Non-uniform scale for stylized art. It distorts real proportions, so it only applies once acknowledged, and it is saved
        with the scene.
      </p>
      <label className="flex items-center gap-1 text-xs text-neutral-300">
        <input type="checkbox" checked={Boolean(override)} onChange={(e) => setStylizedScale(e.target.checked ? IDENTITY_SCALE : null)} />
        Enable override
      </label>
      {override && (
        <>
          {AXIS_LABELS.map((label, i) => (
            <Slider
              key={label}
              label={label}
              value={scale[i] ?? 1}
              min={STYLIZE_MIN}
              max={STYLIZE_MAX}
              step={0.01}
              onChange={(v, preview) => {
                const next: Vec3 = [...scale]
                next[i] = v
                setStylizedScale(next, { preview })
              }}
              onCommit={endGesture}
            />
          ))}
          <label className="mt-1 flex items-start gap-1 text-xs text-amber-300">
            <input type="checkbox" className="mt-0.5" checked={override.acknowledged} onChange={(e) => acknowledgeStylized(e.target.checked)} />
            I understand this breaks realistic proportions. Apply it.
          </label>
        </>
      )}
    </Section>
  )
}
