import { describe, expect, it } from 'vitest'
import { limbLengths, measure } from '../src/lib/measure'
import { parseLibrary, toLibraryFile } from '../src/state/libraryPersistence'
import { BODY_SLIDER_SPECS, groupLockKey, NEUTRAL_SLIDERS, slidersInGroup } from '../src/state/bodySliders'
import { blendSliders, BODY_PRESETS, customPresetName, getPreset } from '../src/state/presets'
import { createAppStore } from '../src/state/store'
import { computeRig, rigFactors, type Segment } from '../src/three/bodyRig'
import { BODY_SLIDER_KEYS } from '../src/types/scene'

const sizes = (s: Segment): number[] => (s.shape === 'box' ? [...s.size] : s.shape === 'capsule' ? [s.radius, s.length] : [s.radius])

describe('slider taxonomy', () => {
  it('every slider has a spec, a group, and every preset lies inside its range', () => {
    for (const k of BODY_SLIDER_KEYS) {
      const spec = BODY_SLIDER_SPECS[k]
      expect(spec.min).toBeLessThan(spec.max)
      expect(spec.neutral).toBeGreaterThanOrEqual(spec.min)
      expect(spec.neutral).toBeLessThanOrEqual(spec.max)
      for (const p of BODY_PRESETS) {
        expect(p.sliders[k], `${p.id}.${k}`).toBeGreaterThanOrEqual(spec.min)
        expect(p.sliders[k], `${p.id}.${k}`).toBeLessThanOrEqual(spec.max)
      }
    }
    expect(slidersInGroup('proportions')).toContain('height')
    expect(slidersInGroup('advanced').length).toBeGreaterThan(0)
  })
})

describe('preset blending', () => {
  it('Athletic → Heavy is coherent: every slider and rig size moves monotonically between the two', () => {
    const a = getPreset('athletic')!.sliders
    const b = getPreset('heavy')!.sliders
    const steps = Array.from({ length: 11 }, (_, i) => i / 10)
    const rigs = steps.map((t) => computeRig(blendSliders(a, b, t)))
    for (const k of BODY_SLIDER_KEYS) {
      const vals = steps.map((t) => blendSliders(a, b, t)[k])
      const lo = Math.min(a[k], b[k])
      const hi = Math.max(a[k], b[k])
      for (const v of vals) expect(v).toBeGreaterThanOrEqual(lo - 1e-12)
      for (const v of vals) expect(v).toBeLessThanOrEqual(hi + 1e-12)
    }
    // Each segment dimension is monotone along t (no bulging past either end), and always positive.
    for (const name of Object.keys(rigs[0]!) as (keyof (typeof rigs)[0])[]) {
      const series = rigs.map((r) => sizes(r[name].segment))
      for (let d = 0; d < series[0]!.length; d++) {
        const col = series.map((s) => s[d]!)
        for (const v of col) expect(v).toBeGreaterThan(0)
        const up = col.every((v, i) => i === 0 || v >= col[i - 1]! - 1e-12)
        const down = col.every((v, i) => i === 0 || v <= col[i - 1]! + 1e-12)
        expect(up || down, `${name}[${d}]`).toBe(true)
      }
    }
    expect(rigFactors(blendSliders(a, b, 0.5)).girth).toBeGreaterThan(rigFactors(a).girth)
    expect(measure(computeRig(blendSliders(a, b, 0.5))).height).toBeCloseTo((a.height + b.height) / 2, 9)
  })

  it('store blend previews as one undo step and marks the body modified from A', () => {
    const store = createAppStore()
    const s = () => store.getState()
    for (let i = 1; i <= 20; i++) s().blendPresets('athletic', 'heavy', i / 20, { preview: true })
    s().endGesture()
    expect(s().history.past).toHaveLength(1)
    expect(s().body.sliders.mass).toBeCloseTo(getPreset('heavy')!.sliders.mass)
    expect(s().body.modifiedFrom).toBe('athletic')
  })

  it('saves the blend as a custom preset named "Modified from Athletic"', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setLibrary({ customPresets: [], favoritePoses: [] })
    s().blendPresets('athletic', 'heavy', 0.5)
    const id = s().saveCustomPreset('athletic')
    const p = s().customPresets.find((c) => c.id === id)!
    expect(p.name).toBe('Modified from Athletic')
    expect(p.sliders).toEqual(s().body.sliders)
    expect(s().body.presetId).toBe(id)
    s().saveCustomPreset('athletic')
    expect(s().customPresets.map((c) => c.name)).toEqual(['Modified from Athletic', 'Modified from Athletic (2)'])
    // Custom presets apply like seed presets.
    s().applyPreset('average')
    s().applyPreset(id)
    expect(s().body.sliders).toEqual(p.sliders)
    expect(customPresetName('Slim / Lean', [])).toBe('Modified from Slim / Lean')
  })
})

describe('body locks and resets', () => {
  it('locked sliders and groups survive presets, blends and resets', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setBodySlider('height', 2.0)
    s().toggleBodyLock('height')
    s().toggleBodyLock(groupLockKey('limbs'))
    s().setBodySlider('handSize', 1.4) // ignored: group locked
    expect(s().body.sliders.handSize).toBe(1)
    s().applyPreset('chibi')
    expect(s().body.sliders.height).toBe(2.0)
    expect(s().body.sliders.handSize).toBe(1)
    expect(s().body.sliders.headScale).toBe(getPreset('chibi')!.sliders.headScale)
    expect(s().body.modifiedFrom).toBe('chibi')
    s().blendPresets('slim', 'heavy', 1)
    expect(s().body.sliders.height).toBe(2.0)
    s().resetBody()
    expect(s().body.sliders.height).toBe(2.0)
    s().setBodySlider('height', 1.5)
    expect(s().body.sliders.height).toBe(2.0)
  })

  it('reset group restores only that group to the preset', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().applyPreset('athletic')
    s().setBodySlider('chestDepth', 1.3)
    s().setBodySlider('legLength', 1.2)
    s().resetBodyGroup('shape')
    expect(s().body.sliders.chestDepth).toBe(getPreset('athletic')!.sliders.chestDepth)
    expect(s().body.sliders.legLength).toBe(1.2)
  })

  it('symmetry edits both sides; asymmetry stores only real differences', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setAsymmetry('leftArmThickness', 1.2, true)
    expect(s().body.asymmetry).toEqual({ leftArmThickness: 1.2, rightArmThickness: 1.2 })
    s().setAsymmetry('leftShoulderHeight', 0.02, false)
    s().setAsymmetry('leftArmThickness', 1, false)
    expect(s().body.asymmetry).toEqual({ rightArmThickness: 1.2, leftShoulderHeight: 0.02 })
    s().resetAsymmetry()
    expect(s().body.asymmetry).toEqual({})
  })

  it('stylized override only applies once acknowledged', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setStylizedScale([1, 1.2, 1])
    expect(s().body.stylizedOverride).toEqual({ matrix: [1, 0, 0, 0, 0, 1.2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], acknowledged: false })
    s().acknowledgeStylized(true)
    expect(s().body.stylizedOverride?.acknowledged).toBe(true)
    s().setStylizedScale([1, 1.3, 1])
    expect(s().body.stylizedOverride?.acknowledged).toBe(true)
    s().setStylizedScale(null)
    expect(s().body.stylizedOverride).toBeNull()
  })
})

describe('head-unit measurements', () => {
  it('reads plausible head counts for adult, child and chibi presets', () => {
    const heads = (id: string) => measure(computeRig(getPreset(id)!.sliders)).heads
    expect(heads('average')).toBeGreaterThan(7.3)
    expect(heads('average')).toBeLessThan(7.9)
    expect(heads('heroic')).toBeGreaterThan(8)
    expect(heads('child')).toBeGreaterThan(5)
    expect(heads('child')).toBeLessThan(6.5)
    expect(heads('chibi')).toBeLessThan(4)
  })

  it('ticks run from the crown down one head unit at a time', () => {
    const m = measure(computeRig(NEUTRAL_SLIDERS))
    expect(m.ticks[0]).toBeCloseTo(1.75)
    expect(m.ticks[0]! - m.ticks[1]!).toBeCloseTo(m.headUnit)
    expect(m.ticks).toHaveLength(Math.floor(m.heads) + 1)
    expect(m.shoulderWidth).toBeCloseTo(0.36)
  })

  it('reports limb bone lengths for the selected joint', () => {
    const rig = computeRig(NEUTRAL_SLIDERS)
    const arm = limbLengths(rig, 'forearmR')!
    expect(arm.label).toBe('Right arm')
    expect(arm.bones.map((b) => b.length)).toEqual([expect.closeTo(0.29), expect.closeTo(0.26), expect.closeTo(0.18)])
    expect(limbLengths(rig, 'thighL')!.total).toBeCloseTo(0.9)
    expect(limbLengths(rig, 'head')).toBeNull()
  })
})

describe('user library file', () => {
  it('round-trips and drops malformed entries', () => {
    const lib = {
      customPresets: [{ id: 'custom-1', name: 'Mine', sliders: { ...NEUTRAL_SLIDERS, mass: 0.9 }, modifiedFrom: 'heavy' }],
      favoritePoses: ['sit'],
      presetMeta: { heroic: { tags: ['comic', 'hero'], notes: 'Cover shots' } },
    }
    expect(parseLibrary(JSON.parse(JSON.stringify(toLibraryFile(lib))))).toEqual(lib)
    expect(parseLibrary({ customPresets: [{ id: 3 }, 'x'], favoritePoses: ['a', 2], presetMeta: { x: 'bad', y: { tags: [1], notes: '' } } })).toEqual({
      customPresets: [],
      favoritePoses: ['a'],
      presetMeta: {},
    })
    expect(parseLibrary(null)).toEqual({ customPresets: [], favoritePoses: [], presetMeta: {} })
  })
})
