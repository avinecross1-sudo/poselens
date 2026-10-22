import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  alwaysShownBalanceWarning,
  closestOnHull,
  COM_OUTSIDE_TOLERANCE_M,
  computeBalance,
  convexHull,
  DEFAULT_MASS_RATIOS,
  distanceToHull,
  footState,
  hullCentroid,
  insideHull,
  leanLabel,
  MASS_SEGMENTS,
  massRatios,
  NO_CONTACT_WARNING,
  OUTSIDE_WARNING,
  weightShare,
  type ContactPoint,
} from '../src/lib/balance'
import { balanceMeta, fromSceneV1 } from '../src/export/metadata'
import { balanceOf, startBalanceSync } from '../src/state/balanceSlice'
import { NEUTRAL_SLIDERS } from '../src/state/bodySliders'
import { createAppStore, type AppStore } from '../src/state/store'
import { computeRig } from '../src/three/bodyRig'
import { defaultPose } from '../src/state/defaults'
import type { Vec2 } from '../src/types/scene'

const sum = (r: Record<string, number>): number => Object.values(r).reduce((t, v) => t + v, 0)
const fixture = (name: string): unknown => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'))

function loaded(raw: unknown): AppStore {
  const store = createAppStore()
  store.getState().replaceDoc(fromSceneV1(raw).doc)
  return store
}

describe('support polygon geometry', () => {
  const square: Vec2[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]

  it('convex hull drops inner and duplicate points and winds counter-clockwise', () => {
    const hull = convexHull([...square, [0.5, 0.5], [0.2, 0.7], [1, 1], [0, 0]])
    expect(hull).toHaveLength(4)
    expect(new Set(hull.map((p) => p.join(',')))).toEqual(new Set(square.map((p) => p.join(','))))
    // Positive signed area = counter-clockwise in (x, z).
    let area = 0
    hull.forEach((p, i) => {
      const q = hull[(i + 1) % hull.length] as Vec2
      area += p[0] * q[1] - q[0] * p[1]
    })
    expect(area).toBeGreaterThan(0)
  })

  it('collinear and tiny inputs', () => {
    expect(convexHull([])).toEqual([])
    expect(convexHull([[1, 2]])).toEqual([[1, 2]])
    expect(convexHull([[0, 0], [1, 1], [2, 2]])).toEqual([[0, 0], [2, 2]])
  })

  it('inside / distance / closest point', () => {
    const hull = convexHull(square)
    expect(insideHull(hull, [0.5, 0.5])).toBe(true)
    expect(insideHull(hull, [1, 0.5])).toBe(true)
    expect(insideHull(hull, [1.2, 0.5])).toBe(false)
    expect(distanceToHull(hull, [0.5, 0.5])).toBe(0)
    expect(distanceToHull(hull, [1.5, 0.5])).toBeCloseTo(0.5)
    expect(distanceToHull(hull, [2, 2])).toBeCloseTo(Math.SQRT2)
    expect(closestOnHull(hull, [-1, 0.25])).toEqual([0, 0.25])
    // Degenerate hulls: a segment and a point.
    expect(distanceToHull([[0, 0], [2, 0]], [1, 1])).toBeCloseTo(1)
    expect(distanceToHull([[0, 0]], [3, 4])).toBeCloseTo(5)
    expect(distanceToHull([], [0, 0])).toBe(Infinity)
  })

  it('centroid of a polygon and of a segment', () => {
    const c = hullCentroid(convexHull(square)) as Vec2
    expect(c[0]).toBeCloseTo(0.5)
    expect(c[1]).toBeCloseTo(0.5)
    expect(hullCentroid([[0, 0], [2, 0]])).toEqual([1, 0])
    expect(hullCentroid([])).toBeNull()
  })
})

describe('mass ratios (balance-spec)', () => {
  it('default ratios sum to 1 and every massed segment has one', () => {
    expect(sum(DEFAULT_MASS_RATIOS)).toBeCloseTo(1, 10)
    expect(Object.keys(DEFAULT_MASS_RATIOS).sort()).toEqual([...MASS_SEGMENTS].sort())
  })

  it('mass at or below neutral leaves the ratios unchanged', () => {
    const r = massRatios({ mass: 0.3, headScale: 1 })
    for (const k of MASS_SEGMENTS) expect(r[k]).toBeCloseTo(DEFAULT_MASS_RATIOS[k], 12)
  })

  it('heavier bodies shift mass to hips and spine, renormalized', () => {
    const r = massRatios({ mass: 1, headScale: 1 })
    expect(sum(r)).toBeCloseTo(1, 10)
    // torsoBoost = 0.25 at mass 1.
    const total = 1 + 0.25 * (DEFAULT_MASS_RATIOS.hips + DEFAULT_MASS_RATIOS.spine)
    expect(r.hips).toBeCloseTo((DEFAULT_MASS_RATIOS.hips * 1.25) / total, 10)
    expect(r.thighL).toBeLessThan(DEFAULT_MASS_RATIOS.thighL)
  })

  it('head mass follows head volume', () => {
    const r = massRatios({ mass: 0.5, headScale: 2 })
    expect(r.head / r.chest).toBeCloseTo((DEFAULT_MASS_RATIOS.head * 8) / DEFAULT_MASS_RATIOS.chest, 10)
  })
})

describe('contacts and foot states', () => {
  const c = (side: 'L' | 'R', part: ContactPoint['part']): ContactPoint => ({ side, part, at: [0, 0], height: 0 })

  it('>= 2 parts planted, 1 edge, 0 floating', () => {
    expect(footState([c('L', 'heel'), c('L', 'heel'), c('L', 'toe')], 'L')).toBe('planted')
    expect(footState([c('L', 'ball'), c('L', 'ball')], 'L')).toBe('edge')
    expect(footState([c('L', 'ball')], 'R')).toBe('floating')
  })

  it('rest pose: both feet planted, CoM over the support polygon at about 57% of height', () => {
    const b = computeBalance({ rig: computeRig(NEUTRAL_SLIDERS), pose: defaultPose(), sliders: NEUTRAL_SLIDERS })
    expect(b.feet).toEqual({ L: 'planted', R: 'planted' })
    expect(b.contacts).toHaveLength(12)
    expect(b.supportPolygon.length).toBeGreaterThanOrEqual(4)
    expect(b.outsideBy).toBe(0)
    expect(b.com[1] / NEUTRAL_SLIDERS.height).toBeGreaterThan(0.53)
    expect(b.com[1] / NEUTRAL_SLIDERS.height).toBeLessThan(0.6)
    expect(b.com[0]).toBeCloseTo(0, 6)
    expect(b.warnings).toEqual([])
    expect(b.weight?.L).toBeCloseTo(0.5, 6)
  })

  it('tiptoe keeps the ball and toe down and lifts the heel', () => {
    const store = createAppStore()
    store.getState().applyFootPreset('L', 'tiptoe')
    const b = balanceOf(store.getState())
    const left = b.contacts.filter((x) => x.side === 'L').map((x) => x.part)
    expect(left).not.toContain('heel')
    expect(left).toContain('ball')
  })

  it('a raised figure has no contact: empty polygon and a warning', () => {
    const pose = defaultPose()
    pose.rootTransform.position = [0, 0.3, 0]
    const b = computeBalance({ rig: computeRig(NEUTRAL_SLIDERS), pose, sliders: NEUTRAL_SLIDERS })
    expect(b.supportPolygon).toEqual([])
    expect(b.warnings).toEqual([NO_CONTACT_WARNING])
    expect(b.weight).toBeNull()
    expect(alwaysShownBalanceWarning(NO_CONTACT_WARNING)).toBe(false)
  })

  it('standing on one foot puts all the weight on it', () => {
    const store = createAppStore()
    const s = store.getState()
    s.setJointRotation('thighR', { rx: -0.9, ry: 0, rz: 0 })
    s.setJointRotation('shinR', { rx: 1.2, ry: 0, rz: 0 })
    const b = balanceOf(store.getState())
    expect(b.feet.R).toBe('floating')
    expect(b.weight).toEqual({ L: 1, R: 0 })
    expect(weightShare([], [0, 0])).toBeNull()
  })
})

describe('CoM outside the support polygon (fixture)', () => {
  it('the off-balance fixture raises a visible warning; the rest pose does not', () => {
    const store = loaded(fixture('off-balance.scene.json'))
    const stop = startBalanceSync(store)
    const b = store.getState().balance
    expect(b).not.toBeNull()
    expect(b!.feet).toEqual({ L: 'planted', R: 'planted' })
    expect(b!.outsideBy).toBeGreaterThan(COM_OUTSIDE_TOLERANCE_M)
    const w = b!.warnings.find((x) => x.startsWith(OUTSIDE_WARNING))
    expect(w).toMatch(/CoM outside support polygon by \d+\.\d cm/)
    // Shown in the viewport even with the balance overlay off.
    expect(alwaysShownBalanceWarning(w!)).toBe(true)
    // The weight-shift target lies on the polygon, behind the heels.
    expect(b!.shiftTarget).not.toBeNull()
    expect(distanceToHull(b!.supportPolygon, b!.shiftTarget!)).toBeCloseTo(0, 9)
    expect(b!.comGround[1]).toBeLessThan(b!.shiftTarget![1])
    expect(leanLabel(b!, 0)).toMatch(/back/)

    // Straighten up: the warning clears.
    store.getState().resetPose()
    expect(store.getState().balance!.warnings).toEqual([])
    stop()
  })

  it('within the 2 cm tolerance no warning is raised', () => {
    const store = createAppStore()
    const s = store.getState()
    // A slight back bend puts the CoM just behind the heels' line or inside it.
    s.setJointRotation('spine', { rx: -0.2, ry: 0, rz: 0 })
    const b = balanceOf(store.getState())
    expect(b.outsideBy).toBeLessThanOrEqual(COM_OUTSIDE_TOLERANCE_M)
    expect(b.warnings).toEqual([])
  })

  it('the saved file carries the balance of the pose', () => {
    const doc = fromSceneV1(fixture('off-balance.scene.json')).doc
    const meta = balanceMeta(doc)
    expect(meta.com).toHaveLength(3)
    expect(meta.contacts).toContain('L:heel')
    expect(meta.warnings.some((x) => x.startsWith(OUTSIDE_WARNING))).toBe(true)
  })
})

describe('CoM responds to body sliders', () => {
  it('the mass slider moves the CoM (torso gains mass) and the store recomputes it', () => {
    const store = createAppStore()
    const stop = startBalanceSync(store)
    const s = () => store.getState()
    s().setJointRotation('spine', { rx: 1.0, ry: 0, rz: 0 })
    s().setJointRotation('chest', { rx: 0.4, ry: 0, rz: 0 })
    const before = s().balance!.com
    s().setBodySlider('mass', 1)
    const after = s().balance!.com
    const moved = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])
    // Spec model: mass 0.5 -> 1 boosts hips + spine by 25%; about 1.7 cm in this bent pose.
    expect(moved).toBeGreaterThan(0.01)
    // Mass moves toward the torso: up, and back toward the hips from the bent-over chest and arms.
    expect(after[1]).toBeGreaterThan(before[1])
    stop()
  })

  it('a big head (chibi) raises the CoM relative to height', () => {
    const rel = (preset: string): number => {
      const store = createAppStore()
      store.getState().applyPreset(preset)
      const s = store.getState()
      return balanceOf(s).com[1] / s.body.sliders.height
    }
    expect(rel('chibi') - rel('average')).toBeGreaterThan(0.03)
  })

  it('switching from the slim to the heavy preset moves the CoM', () => {
    const com = (preset: string) => {
      const store = createAppStore()
      store.getState().applyPreset(preset)
      store.getState().setJointRotation('spine', { rx: 1.0, ry: 0, rz: 0 })
      return balanceOf(store.getState()).com
    }
    const a = com('slim')
    const b = com('heavy')
    expect(Math.hypot(a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.005)
  })
})

describe('feet sliding', () => {
  it('a planted foot moving during a drag is reported; a fresh edit clears it', () => {
    const store = createAppStore()
    const stop = startBalanceSync(store)
    const s = () => store.getState()
    // Moving the root 1 cm drags both planted feet across the floor.
    s().setRootTransform({ position: [0.01, 0, 0], rotation: [0, 0, 0] }, { preview: true })
    expect(s().balance!.warnings).toContain('Left foot sliding')
    expect(s().balance!.warnings).toContain('Right foot sliding')
    s().endGesture()
    s().setJointRotation('forearmL', { rx: -0.5, ry: 0, rz: 0 })
    expect(s().balance!.warnings.some((w) => w.endsWith('sliding'))).toBe(false)
    stop()
  })

  it('posing an arm during a drag does not slide the feet', () => {
    const store = createAppStore()
    const stop = startBalanceSync(store)
    store.getState().setJointRotation('upperArmL', { rx: -0.3, ry: 0, rz: 0.4 }, { preview: true })
    store.getState().setJointRotation('upperArmL', { rx: -0.6, ry: 0, rz: 0.8 }, { preview: true })
    expect(store.getState().balance!.warnings).toEqual([])
    stop()
  })
})
