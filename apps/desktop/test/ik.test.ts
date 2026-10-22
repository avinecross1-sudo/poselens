import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { forwardKinematics, jointPosition } from '../src/solve/fk'
import { hingeAngle, IK_CHAIN_IDS, IK_CHAINS, IK_MAX_ITERATIONS, IK_REACH_TOLERANCE_M, solveIk, type IkChainId } from '../src/solve/ik'
import { clampRotation, JOINT_LIMITS, limitViolations, withinLimits } from '../src/solve/jointLimits'
import { defaultPose } from '../src/state/defaults'
import { NEUTRAL_SLIDERS } from '../src/state/bodySliders'
import { computeRig } from '../src/three/bodyRig'
import { JOINT_NAMES } from '../src/types/scene'

const rig = computeRig(NEUTRAL_SLIDERS)
const pose = defaultPose()
const effectorAt = (joints = pose.joints, chain: IkChainId = 'armL') =>
  jointPosition(forwardKinematics(rig, joints, pose.rootTransform), IK_CHAINS[chain].effector)

/** Deterministic pseudo-random numbers so failures reproduce. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('joint limits', () => {
  it('every joint has ordered limits and rest is inside them', () => {
    for (const j of JOINT_NAMES) {
      for (const axis of ['rx', 'ry', 'rz'] as const) {
        const [lo, hi] = JOINT_LIMITS[j][axis]
        expect(lo).toBeLessThanOrEqual(hi)
      }
      expect(withinLimits(j, { rx: 0, ry: 0, rz: 0 })).toBe(true)
    }
  })

  it('right-side limits mirror the left (ry and rz negate)', () => {
    const l = JOINT_LIMITS.upperArmL
    const r = JOINT_LIMITS.upperArmR
    expect(r.rx).toEqual(l.rx)
    expect(r.rz[0]).toBeCloseTo(-l.rz[1])
    expect(r.rz[1]).toBeCloseTo(-l.rz[0])
  })

  it('clamps into range and reports violations', () => {
    const c = clampRotation('shinL', { rx: -1, ry: 2, rz: 0 })
    expect(c.rx).toBe(0)
    expect(withinLimits('shinL', c)).toBe(true)
    const bad = { ...pose, joints: { ...pose.joints, forearmR: { rx: 0.5, ry: 0, rz: 0 } } }
    expect(limitViolations(bad)).toEqual(['forearmR'])
  })
})

describe('CCD IK', () => {
  it('hinge angle follows the law of cosines', () => {
    expect(hingeAngle(0.3, 0.4, 0.7)).toBeCloseTo(0)
    expect(hingeAngle(0.3, 0.4, 0.5)).toBeCloseTo(Math.PI / 2)
    expect(hingeAngle(0.3, 0.4, 0.1)).toBeCloseTo(Math.PI)
    expect(hingeAngle(0.3, 0.4, 2)).toBe(0)
  })

  it('reaches a reachable target within the iteration cap', () => {
    // Hand moved forward and up, well inside the arm's reach.
    const start = effectorAt()
    const target = start.clone().add(new Vector3(0, 0.25, 0.3))
    const r = solveIk({ rig, joints: pose.joints, root: pose.rootTransform, chain: 'armL', target })
    expect(r.iterations).toBeLessThanOrEqual(IK_MAX_ITERATIONS)
    expect(r.reached).toBe(true)
    expect(effectorAt(r.joints).distanceTo(target)).toBeCloseTo(r.error, 9)
  })

  it('bends the knee the right way to lift the foot', () => {
    const start = effectorAt(pose.joints, 'legL')
    const target = start.clone().add(new Vector3(0, 0.25, 0.2))
    const r = solveIk({ rig, joints: pose.joints, root: pose.rootTransform, chain: 'legL', target })
    expect(r.joints.shinL.rx).toBeGreaterThan(0)
    expect(r.reached).toBe(true)
  })

  it('never violates joint limits, for any target', () => {
    const rand = rng(42)
    for (let i = 0; i < 200; i++) {
      const chain = IK_CHAIN_IDS[i % IK_CHAIN_IDS.length] as IkChainId
      const target = new Vector3((rand() - 0.5) * 3, rand() * 2.5 - 0.3, (rand() - 0.5) * 3)
      const r = solveIk({ rig, joints: pose.joints, root: pose.rootTransform, chain, target })
      expect(limitViolations({ joints: r.joints })).toEqual([])
      expect(r.iterations).toBeLessThanOrEqual(IK_MAX_ITERATIONS)
    }
  })

  it('reports an unreachable target instead of stretching', () => {
    const target = new Vector3(5, 1.4, 0)
    const r = solveIk({ rig, joints: pose.joints, root: pose.rootTransform, chain: 'armR', target })
    expect(r.reached).toBe(false)
    expect(r.error).toBeGreaterThan(IK_REACH_TOLERANCE_M)
  })

  it('leaves locked joints and other chains untouched', () => {
    const target = effectorAt().add(new Vector3(0, 0.3, 0.3))
    const r = solveIk({ rig, joints: pose.joints, root: pose.rootTransform, chain: 'armL', target, locked: new Set(['upperArmL']) })
    expect(r.joints.upperArmL).toEqual(pose.joints.upperArmL)
    expect(r.joints.upperArmR).toEqual(pose.joints.upperArmR)
    expect(r.joints.thighL).toEqual(pose.joints.thighL)
  })
})
