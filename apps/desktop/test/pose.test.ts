import { describe, expect, it } from 'vitest'
import { Euler, Quaternion } from 'three'
import { blendPoses, keepLocked, lerpRotation, lockedJoints, mirrorJointName, mirrorPose, slerpRotation } from '../src/lib/poseOps'
import { forwardKinematics, lowestPoint } from '../src/solve/fk'
import { limitViolations } from '../src/solve/jointLimits'
import { GROUND_CONTACT_M, poseWarnings, retargetPose } from '../src/solve/retarget'
import { NEUTRAL_SLIDERS } from '../src/state/bodySliders'
import { defaultPose } from '../src/state/defaults'
import { getLibraryPose, POSE_LIBRARY, POSE_TAGS, searchPoses } from '../src/state/poseLibrary'
import { buildLibraryPose } from '../src/state/poseSlice'
import { BODY_PRESETS, getPreset } from '../src/state/presets'
import { createAppStore } from '../src/state/store'
import { computeRig } from '../src/three/bodyRig'
import { JOINT_NAMES, type PoseState } from '../src/types/scene'

const neutralRig = computeRig(NEUTRAL_SLIDERS)
const lowest = (rig: ReturnType<typeof computeRig>, p: PoseState) => lowestPoint(rig, forwardKinematics(rig, p.joints, p.rootTransform))
const angle = (a: { rx: number; ry: number; rz: number }) => Math.hypot(a.rx, a.ry, a.rz)

function libPose(id: string, body = createAppStore().getState().body): PoseState {
  const p = buildLibraryPose({ pose: defaultPose(), body }, id)
  if (!p) throw new Error(`missing pose ${id}`)
  return p
}

describe('pose library', () => {
  it('has the 12 seeded poses, each with joint data inside joint limits', () => {
    expect(POSE_LIBRARY).toHaveLength(12)
    expect(new Set(POSE_LIBRARY.map((p) => p.id)).size).toBe(12)
    for (const p of POSE_LIBRARY) {
      expect(limitViolations({ joints: p.joints }), p.id).toEqual([])
      if (p.id !== 'stand-relaxed') expect(JOINT_NAMES.some((j) => angle(p.joints[j]) > 0.1), p.id).toBe(true)
    }
  })

  it('grounds poses on apply; jump is lifted', () => {
    for (const p of POSE_LIBRARY) {
      const pose = libPose(p.id)
      expect(lowest(neutralRig, pose), p.id).toBeCloseTo(p.lift, 6)
    }
    expect(getLibraryPose('jump')?.lift).toBeGreaterThan(0)
  })

  it('search matches name, tag and favorites', () => {
    expect(searchPoses('walk').map((p) => p.id)).toEqual(['walk-1', 'walk-2'])
    expect(searchPoses('', { tag: 'combat' }).map((p) => p.id)).toEqual(['punch', 'kick'])
    expect(searchPoses('', { favoritesOnly: true, favorites: ['sit'] }).map((p) => p.id)).toEqual(['sit'])
    expect(searchPoses('RUN action').map((p) => p.id)).toEqual(['run-1'])
    expect(POSE_TAGS).toContain('locomotion')
  })
})

describe('mirror', () => {
  it('maps sides and is its own inverse', () => {
    expect(mirrorJointName('thighL')).toBe('thighR')
    expect(mirrorJointName('spine')).toBe('spine')
    const p = libPose('punch')
    const m = mirrorPose(p)
    expect(m.joints.upperArmL.rx).toBeCloseTo(p.joints.upperArmR.rx)
    expect(m.joints.upperArmL.rz).toBeCloseTo(-p.joints.upperArmR.rz)
    expect(m.joints.hips.ry).toBeCloseTo(-p.joints.hips.ry)
    const back = mirrorPose(m)
    for (const j of JOINT_NAMES) expect(back.joints[j]).toEqual(expect.objectContaining({ rx: p.joints[j].rx }))
    expect(back.rootTransform).toEqual(p.rootTransform)
  })

  it('mirrored library poses stay inside joint limits', () => {
    for (const p of POSE_LIBRARY) expect(limitViolations(mirrorPose(libPose(p.id))), p.id).toEqual([])
  })

  it('keeps locked joints', () => {
    const p = { ...libPose('punch'), jointLocks: ['upperArmL'] }
    expect(mirrorPose(p).joints.upperArmL).toEqual(p.joints.upperArmL)
  })
})

describe('pose blend', () => {
  it('endpoints reproduce the inputs', () => {
    const a = libPose('stand-relaxed')
    const b = libPose('crouch')
    expect(blendPoses(a, b, 0).joints).toEqual(a.joints)
    expect(blendPoses(a, b, 1).joints).toEqual(b.joints)
  })

  it('halfway is plausible: each joint sits halfway along the shortest arc, inside limits', () => {
    const a = libPose('stand-relaxed')
    const b = libPose('crouch')
    const mid = blendPoses(a, b, 0.5)
    expect(mid.joints.shinL.rx).toBeCloseTo((a.joints.shinL.rx + b.joints.shinL.rx) / 2, 6)
    expect(mid.joints.thighR.rx).toBeCloseTo((a.joints.thighR.rx + b.joints.thighR.rx) / 2, 6)
    for (const p of POSE_LIBRARY) {
      for (const q of POSE_LIBRARY) expect(limitViolations(blendPoses(libPose(p.id), libPose(q.id), 0.5)), `${p.id}/${q.id}`).toEqual([])
    }
  })

  it('slerp takes the short way round', () => {
    // 3 rad and -3 rad are 0.28 rad apart through pi; halfway is pi (any Euler spelling of it).
    const q = (r: { rx: number; ry: number; rz: number }) => new Quaternion().setFromEuler(new Euler(r.rx, r.ry, r.rz, 'XYZ'))
    const mid = slerpRotation({ rx: 0, ry: 3, rz: 0 }, { rx: 0, ry: -3, rz: 0 }, 0.5)
    expect(q(mid).angleTo(q({ rx: 0, ry: Math.PI, rz: 0 }))).toBeLessThan(1e-6)
  })

  it('limited joints blend per channel and stay inside their limits', () => {
    const mid = lerpRotation({ rx: -2.8, ry: 0, rz: 0.2 }, { rx: 0.3, ry: 0, rz: 0 }, 0.5)
    expect(mid.rx).toBeCloseTo(-1.25)
    expect(mid.rz).toBeCloseTo(0.1)
  })

  it('store blend between two grounded poses stays grounded', () => {
    const store = createAppStore()
    const s = store.getState()
    s.blendPose(libPose('stand-relaxed'), libPose('crouch'), 0.4)
    expect(lowest(neutralRig, store.getState().pose)).toBeCloseTo(0, 6)
  })
})

describe('locks', () => {
  it('chain locks lock every joint in the chain', () => {
    const locked = lockedJoints({ jointLocks: ['head'], ikLocks: ['legR'] })
    expect([...locked].sort()).toEqual(['footR', 'head', 'shinR', 'thighR'])
  })

  it('locked joints survive every pose edit', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setJointRotation('forearmL', { rx: -1, ry: 0, rz: 0 })
    s().toggleJointLock('forearmL')
    s().toggleChainLock('legR')
    const legR = { ...s().pose.joints.shinR }
    const keep = s().pose.joints.forearmL

    s().setJointRotation('forearmL', { rx: -0.2, ry: 0, rz: 0 })
    s().resetJoint('forearmL')
    s().applyLibraryPose('run-1')
    s().mirrorPose()
    s().resetPose()
    s().blendPose(libPose('crouch'), libPose('kick'), 0.5)
    s().applyFootPreset('R', 'tiptoe')
    s().solveIkTarget('legR', [0.3, 0.6, 0.4])
    s().applyPreset('chibi')

    expect(s().pose.joints.forearmL).toEqual(keep)
    expect(s().pose.joints.shinR).toEqual(legR)
    expect(s().pose.jointLocks).toEqual(['forearmL'])
  })

  it('keepLocked copies current values for locked joints only', () => {
    const cur = { ...defaultPose(), jointLocks: ['head'] }
    const next = libPose('reach-up')
    const out = keepLocked(cur, next.joints)
    expect(out.head).toEqual(cur.joints.head)
    expect(out.upperArmL).toEqual(next.joints.upperArmL)
  })
})

describe('retarget on body change', () => {
  it('keeps rotations and keeps a standing pose on the ground', () => {
    const pose = libPose('walk-1')
    for (const p of BODY_PRESETS) {
      const to = computeRig(p.sliders)
      const r = retargetPose(pose, neutralRig, to)
      expect(r.pose.joints).toEqual(pose.joints)
      expect(lowest(to, r.pose), p.id).toBeCloseTo(0, 6)
    }
  })

  it('keeps an airborne pose at its root height', () => {
    const jump = libPose('jump')
    const r = retargetPose(jump, neutralRig, computeRig(getPreset('chibi')!.sliders))
    expect(r.pose.rootTransform).toEqual(jump.rootTransform)
  })

  it('warns when a planted foot lifts off on the new body', () => {
    const pose = defaultPose()
    // Raising the left hip joint shortens the left leg's reach: the right foot stays down, the left lifts.
    const uneven = computeRig(NEUTRAL_SLIDERS, { leftHipHeight: 0.03 })
    const r = retargetPose(pose, neutralRig, uneven)
    expect(r.warnings.join(' ')).toMatch(/Left foot lifts 3.0 cm/)
    expect(r.warnings.join(' ')).not.toMatch(/Right foot/)
  })

  it('warns about joints outside limits', () => {
    const pose = { ...defaultPose(), joints: { ...defaultPose().joints, shinL: { rx: -0.5, ry: 0, rz: 0 } } }
    expect(poseWarnings(neutralRig, pose).join(' ')).toMatch(/shinL/)
  })

  it('body slider changes retarget the scene pose and keep feet down', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().applyLibraryPose('crouch')
    s().applyPreset('heavy')
    s().setBodySlider('legLength', 1.2)
    const rig = computeRig(s().body.sliders, s().body.asymmetry)
    expect(lowest(rig, s().pose)).toBeCloseTo(0, 6)
    expect(s().pose.joints.shinL.rx).toBeCloseTo(libPose('crouch').joints.shinL.rx)
  })

  it('a grounded pose under the stand pose is within contact tolerance', () => {
    expect(Math.abs(lowest(neutralRig, defaultPose()))).toBeLessThan(GROUND_CONTACT_M)
  })
})

describe('hands, feet, IK in the store', () => {
  it('hand shapes and foot presets', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setHandShape('L', 'fist')
    expect(s().pose.hands).toEqual({ L: 'fist', R: 'relaxed' })
    s().applyFootPreset('L', 'tiptoe')
    expect(s().pose.joints.footL.rx).toBeGreaterThan(0)
    expect(s().pose.joints.toeL.rx).toBeLessThan(0)
    // Going up on one tiptoe raises the body rather than sinking the toes.
    expect(lowest(neutralRig, s().pose)).toBeCloseTo(0, 6)
    s().setToeDirection('R', 0.3)
    expect(s().pose.joints.footR.ry).toBeCloseTo(-0.3)
  })

  it('an IK drag is one undo step and stays inside limits', () => {
    const store = createAppStore()
    const s = () => store.getState()
    for (let i = 1; i <= 10; i++) s().solveIkTarget('armR', [-0.3 - i * 0.02, 1.1 + i * 0.04, 0.3], { preview: true })
    s().endGesture()
    expect(s().history.past.map((c) => c.label)).toEqual(['IK Right arm'])
    expect(limitViolations(s().pose)).toEqual([])
  })
})
