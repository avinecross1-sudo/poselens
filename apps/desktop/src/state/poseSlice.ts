import type { StateCreator } from 'zustand'
import { Vector3 } from 'three'
import { applyFootPreset, blendPoses, keepLocked, lockedJoints, mirrorPose, toeDirectionToRy } from '../lib/poseOps'
import { lowestPoint, posePositions } from '../solve/fk'
import { IK_CHAINS, solveIk } from '../solve/ik'
import { GROUND_CONTACT_M, groundPose, poseWarnings, preserveGroundContact } from '../solve/retarget'
import type { JointName, PoseState } from '../types/scene'
import { defaultHands, defaultJoints, defaultPose, zeroRotation } from './defaults'
import { getLibraryPose } from './poseLibrary'
import { rigOf, stylizeOf } from './rigOf'
import type { EditOpts, PoseSlice, Store } from './types'

const CM_PER_M = 100

const toggle = (list: readonly string[], item: string): string[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

/** A library pose on the current body: rotations from the library (locked joints kept), grounded + lift. */
export function buildLibraryPose(s: Pick<Store, 'pose' | 'body'>, id: string): PoseState | null {
  const lib = getLibraryPose(id)
  if (!lib) return null
  const locked = lockedJoints(s.pose)
  const next: PoseState = {
    ...s.pose,
    joints: keepLocked(s.pose, lib.joints, locked),
    hands: { L: locked.has('handL') ? s.pose.hands.L : lib.hands.L, R: locked.has('handR') ? s.pose.hands.R : lib.hands.R },
  }
  return groundPose(rigOf(s.body), next, lib.lift, stylizeOf(s.body))
}

export const createPoseSlice: StateCreator<Store, [], [], PoseSlice> = (_set, get) => {
  const isLocked = (j: JointName): boolean => lockedJoints(get().pose).has(j)

  /** Pose edit that reports what the new pose looks like on the current body. */
  const poseEdit = (label: string, next: (s: Store) => PoseState | null, opts?: EditOpts): void => {
    const out = { changed: false }
    get().edit(
      label,
      (s) => {
        const pose = next(s)
        if (!pose) return {}
        out.changed = true
        return { pose }
      },
      opts,
    )
    if (out.changed) {
      const s = get()
      s.setPoseWarnings(poseWarnings(rigOf(s.body), s.pose, stylizeOf(s.body)))
    }
  }

  return {
    pose: defaultPose(),

    setJointRotation: (joint, rot, opts) => {
      if (isLocked(joint)) return
      get().edit(`Rotate ${joint}`, (s) => ({ pose: { ...s.pose, joints: { ...s.pose.joints, [joint]: { ...rot } } } }), opts)
    },

    resetJoint: (joint) => {
      if (isLocked(joint)) return
      get().edit(`Reset ${joint}`, (s) => ({ pose: { ...s.pose, joints: { ...s.pose.joints, [joint]: zeroRotation() } } }))
    },

    resetPose: () =>
      poseEdit('Reset pose', (s) => {
        const locked = lockedJoints(s.pose)
        const hands = defaultHands()
        return {
          ...defaultPose(),
          joints: keepLocked(s.pose, defaultJoints(), locked),
          hands: { L: locked.has('handL') ? s.pose.hands.L : hands.L, R: locked.has('handR') ? s.pose.hands.R : hands.R },
          ikLocks: s.pose.ikLocks,
          jointLocks: s.pose.jointLocks,
        }
      }),

    setRootTransform: (t, opts) =>
      get().edit(
        'Move root',
        (s) => ({ pose: { ...s.pose, rootTransform: { position: [...t.position], rotation: [...t.rotation] } } }),
        opts,
      ),

    toggleJointLock: (joint) =>
      get().edit(`Toggle lock ${joint}`, (s) => ({ pose: { ...s.pose, jointLocks: toggle(s.pose.jointLocks, joint) } })),

    toggleChainLock: (chain) =>
      get().edit(`Toggle lock ${IK_CHAINS[chain].label}`, (s) => ({ pose: { ...s.pose, ikLocks: toggle(s.pose.ikLocks, chain) } })),

    solveIkTarget: (chain, target, opts) => {
      const s = get()
      if (s.pose.ikLocks.includes(chain)) return
      const r = solveIk({
        rig: rigOf(s.body),
        joints: s.pose.joints,
        root: s.pose.rootTransform,
        stylize: stylizeOf(s.body),
        chain,
        target: new Vector3(...target),
        locked: lockedJoints(s.pose),
      })
      s.edit(`IK ${IK_CHAINS[chain].label}`, (st) => ({ pose: { ...st.pose, joints: r.joints } }), opts)
      s.setPoseWarnings(r.reached ? [] : [`${IK_CHAINS[chain].label}: target out of reach (${(r.error * CM_PER_M).toFixed(1)} cm short)`])
    },

    applyLibraryPose: (id) => {
      const name = getLibraryPose(id)?.name ?? id
      poseEdit(`Pose ${name}`, (s) => buildLibraryPose(s, id))
    },

    mirrorPose: () => poseEdit('Mirror pose', (s) => mirrorPose(s.pose)),

    blendPose: (from, to, t, opts) =>
      poseEdit(
        'Blend pose',
        (s) => {
          const rig = rigOf(s.body)
          const st = stylizeOf(s.body)
          // Locks belong to the scene, not to the blend endpoints (which may be library poses).
          const mixed = blendPoses({ ...from, jointLocks: s.pose.jointLocks, ikLocks: s.pose.ikLocks }, to, t)
          const locked = lockedJoints(s.pose)
          const blended: PoseState = {
            ...mixed,
            joints: keepLocked(s.pose, mixed.joints, locked),
            hands: { L: locked.has('handL') ? s.pose.hands.L : mixed.hands.L, R: locked.has('handR') ? s.pose.hands.R : mixed.hands.R },
            depthNudges: s.pose.depthNudges,
          }
          // Two grounded poses blend to a grounded pose (the lerped root height alone can float or sink).
          const grounded = (p: PoseState) => lowestPoint(rig, posePositions(rig, p, st)) <= GROUND_CONTACT_M
          return grounded(from) && grounded(to) ? groundPose(rig, blended, 0, st) : blended
        },
        opts,
      ),

    setHandShape: (side, shape) => {
      if (isLocked(`hand${side}`)) return
      get().edit(`Hand ${side} ${shape}`, (s) => ({ pose: { ...s.pose, hands: { ...s.pose.hands, [side]: shape } } }))
    },

    applyFootPreset: (side, preset) =>
      poseEdit(`Foot ${side} ${preset}`, (s) => {
        const next = { ...s.pose, joints: applyFootPreset(s.pose, side, preset) }
        return preserveGroundContact(rigOf(s.body), s.pose, next, stylizeOf(s.body))
      }),

    setToeDirection: (side, outward, opts) => {
      const foot: JointName = `foot${side}`
      if (isLocked(foot)) return
      get().edit(
        `Toe direction ${side}`,
        (s) => ({
          pose: { ...s.pose, joints: { ...s.pose.joints, [foot]: { ...s.pose.joints[foot], ry: toeDirectionToRy(side, outward) } } },
        }),
        opts,
      )
    },
  }
}
