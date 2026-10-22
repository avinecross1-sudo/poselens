import { describe, expect, it } from 'vitest'
import { computeRig, REFERENCE_HEIGHT_M, rigFactors, SKELETON, type Segment } from '../src/three/bodyRig'
import { measure } from '../src/lib/measure'
import { BODY_PRESETS, defaultPreset } from '../src/state/presets'
import type { BodySliders } from '../src/types/scene'

const base = (): BodySliders => ({ ...defaultPreset().sliders })
const radius = (s: Segment): number => (s.shape === 'capsule' || s.shape === 'sphere' ? s.radius : NaN)
const boxWidth = (s: Segment): number => (s.shape === 'box' ? s.size[0] : NaN)

describe('bodyRig', () => {
  it('reference preset reproduces the rest skeleton', () => {
    const rig = computeRig(base())
    // Authored rest skeleton (Phase 1 values) at neutral sliders.
    const rest: Record<string, [number, number, number]> = {
      hips: [0, 0.95, 0],
      spine: [0, 0.1, 0],
      chest: [0, 0.18, 0],
      neck: [0, 0.27, 0],
      head: [0, 0.06, 0],
      shoulderL: [0.03, 0.22, 0],
      upperArmL: [0.15, 0, 0],
      forearmL: [0, -0.29, 0],
      handL: [0, -0.26, 0],
      thighR: [-0.09, -0.05, 0],
      shinR: [0, -0.44, 0],
      footR: [0, -0.39, 0],
      toeR: [0, -0.045, 0.13],
    }
    for (const [name, v] of Object.entries(rest)) {
      const off = rig[name as keyof typeof rig].offset
      v.forEach((x, i) => expect(off[i]).toBeCloseTo(x, 9))
    }
    expect(SKELETON).toHaveLength(21)
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

describe('bodyRig proportions (Phase 2)', () => {
  it('standing height always equals the height slider', () => {
    for (const p of BODY_PRESETS) expect(measure(computeRig(p.sliders)).height).toBeCloseTo(p.sliders.height, 9)
    const odd = { ...base(), headScale: 1.8, legLength: 0.7, torsoLength: 1.2, neckLength: 1.5, footSize: 1.4 }
    expect(measure(computeRig(odd)).height).toBeCloseTo(odd.height, 9)
  })

  it('feet rest on the ground for every preset', () => {
    for (const p of BODY_PRESETS) {
      const rig = computeRig(p.sliders)
      const foot = rig.footL.segment
      if (foot.shape !== 'box') throw new Error('foot should be a box')
      const ankleY = rig.hips.offset[1] + rig.thighL.offset[1] + rig.shinL.offset[1] + rig.footL.offset[1]
      expect(ankleY + foot.center[1] - foot.size[1] / 2).toBeCloseTo(0, 9)
    }
  })

  it('a bigger head means fewer heads tall; longer legs take a larger share', () => {
    const a = measure(computeRig(base()))
    const b = measure(computeRig({ ...base(), headScale: 1.3 }))
    expect(b.heads).toBeLessThan(a.heads)
    const legs = (s: BodySliders) => computeRig(s).hips.offset[1]
    expect(legs({ ...base(), legLength: 1.2 })).toBeGreaterThan(legs(base()))
  })

  it('ratio sliders move length between segments and keep the limb total', () => {
    const r0 = computeRig(base())
    const r1 = computeRig({ ...base(), forearmRatio: 1.2 })
    const arm = (r: typeof r0) => -r.forearmL.offset[1] - r.handL.offset[1]
    expect(arm(r1)).toBeCloseTo(arm(r0), 9)
    expect(-r1.handL.offset[1]).toBeGreaterThan(-r0.handL.offset[1])
  })

  it('asymmetry thickens one side and shifts one shoulder', () => {
    const r = computeRig(base(), { leftArmThickness: 1.3, rightShoulderHeight: 0.02 })
    expect(radius(r.upperArmL.segment)).toBeGreaterThan(radius(r.upperArmR.segment))
    expect(r.shoulderR.offset[1] - r.shoulderL.offset[1]).toBeCloseTo(0.02, 9)
  })

  it('depth sliders change depth only', () => {
    const a = computeRig(base()).chest.segment
    const b = computeRig({ ...base(), chestDepth: 1.3 }).chest.segment
    if (a.shape !== 'box' || b.shape !== 'box') throw new Error('chest should be a box')
    expect(b.size[2]).toBeCloseTo(a.size[2] * 1.3, 9)
    expect(b.size[0]).toBeCloseTo(a.size[0], 9)
  })
})
