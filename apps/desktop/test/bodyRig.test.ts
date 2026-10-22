import { describe, expect, it } from 'vitest'
import { computeRig, REFERENCE_HEIGHT_M, rigFactors, SKELETON, type Segment } from '../src/three/bodyRig'
import { BODY_PRESETS, defaultPreset } from '../src/state/presets'
import type { BodySliders } from '../src/types/scene'

const base = (): BodySliders => ({ ...defaultPreset().sliders })
const radius = (s: Segment): number => (s.shape === 'capsule' || s.shape === 'sphere' ? s.radius : NaN)
const boxWidth = (s: Segment): number => (s.shape === 'box' ? s.size[0] : NaN)

describe('bodyRig', () => {
  it('reference preset reproduces the rest skeleton', () => {
    const rig = computeRig(base())
    for (const b of SKELETON) expect(rig[b.name].offset).toEqual(b.offset)
    const f = rigFactors(base())
    expect(f.length).toBeCloseTo(1)
    expect(f.girth).toBeCloseTo(1)
    expect(f.muscle).toBeCloseTo(1)
    expect(f.shoulderWidth).toBeCloseTo(1)
  })

  it('default preset is Realistic Average at 1.75 m', () => {
    expect(defaultPreset().name).toBe('Realistic Average')
    expect(defaultPreset().sliders.height).toBe(REFERENCE_HEIGHT_M)
  })

  it('height scales bone lengths proportionally', () => {
    const rig1 = computeRig(base())
    const rig2 = computeRig({ ...base(), height: REFERENCE_HEIGHT_M * 1.2 })
    expect(rig2.shinL.offset[1]).toBeCloseTo(rig1.shinL.offset[1] * 1.2)
    expect(rig2.hips.offset[1]).toBeCloseTo(rig1.hips.offset[1] * 1.2)
  })

  it('mass and softness widen capsule radius', () => {
    const r0 = radius(computeRig(base()).upperArmL.segment)
    expect(radius(computeRig({ ...base(), mass: 0.9 }).upperArmL.segment)).toBeGreaterThan(r0)
    expect(radius(computeRig({ ...base(), softness: 0.9 }).upperArmL.segment)).toBeGreaterThan(r0)
    expect(radius(computeRig({ ...base(), mass: 0.1 }).upperArmL.segment)).toBeLessThan(r0)
  })

  it('muscle widens limbs and chest but not the head', () => {
    const a = computeRig(base())
    const b = computeRig({ ...base(), muscle: 1 })
    expect(radius(b.thighL.segment)).toBeGreaterThan(radius(a.thighL.segment))
    expect(boxWidth(b.chest.segment)).toBeGreaterThan(boxWidth(a.chest.segment))
    expect(radius(b.head.segment)).toBeCloseTo(radius(a.head.segment))
  })

  it('shoulder-hip ratio spreads shoulders and narrows hips', () => {
    const a = computeRig(base())
    const b = computeRig({ ...base(), shoulderHipRatio: 1.5 })
    expect(b.upperArmL.offset[0]).toBeGreaterThan(a.upperArmL.offset[0])
    expect(b.upperArmR.offset[0]).toBeLessThan(a.upperArmR.offset[0])
    expect(Math.abs(b.thighL.offset[0])).toBeLessThan(Math.abs(a.thighL.offset[0]))
    const shoulderSpan = b.upperArmL.offset[0] / Math.abs(b.thighL.offset[0])
    const shoulderSpan0 = a.upperArmL.offset[0] / Math.abs(a.thighL.offset[0])
    expect(shoulderSpan / shoulderSpan0).toBeCloseTo(1.5 / 1.15)
  })

  it('every seed preset produces finite, positive sizes', () => {
    for (const p of BODY_PRESETS) {
      const rig = computeRig(p.sliders)
      for (const b of SKELETON) {
        const s = rig[b.name].segment
        const sizes = s.shape === 'box' ? s.size : s.shape === 'capsule' ? [s.radius, s.length] : [s.radius]
        for (const v of sizes) expect(v).toBeGreaterThan(0)
        expect(rig[b.name].jointRadius).toBeGreaterThan(0)
      }
    }
  })

  it('feet rest on the ground at reference height', () => {
    // Sum offsets down the left leg and subtract the foot box half-height + centre offset.
    const rig = computeRig(base())
    const ankleY = rig.hips.offset[1] + rig.thighL.offset[1] + rig.shinL.offset[1] + rig.footL.offset[1]
    const foot = rig.footL.segment
    if (foot.shape !== 'box') throw new Error('foot should be a box')
    expect(ankleY + foot.center[1] - foot.size[1] / 2).toBeCloseTo(0, 6)
  })
})
