import type { StateCreator } from 'zustand'
import { defaultPose, zeroRotation } from './defaults'
import type { PoseSlice, Store } from './types'

export const createPoseSlice: StateCreator<Store, [], [], PoseSlice> = (_set, get) => ({
  pose: defaultPose(),

  setJointRotation: (joint, rot, opts) =>
    get().edit(`Rotate ${joint}`, (s) => ({ pose: { ...s.pose, joints: { ...s.pose.joints, [joint]: { ...rot } } } }), opts),

  resetJoint: (joint) =>
    get().edit(`Reset ${joint}`, (s) => ({ pose: { ...s.pose, joints: { ...s.pose.joints, [joint]: zeroRotation() } } })),

  resetPose: () =>
    get().edit('Reset pose', (s) => ({ pose: { ...defaultPose(), ikLocks: s.pose.ikLocks, jointLocks: s.pose.jointLocks } })),

  setRootTransform: (t, opts) =>
    get().edit(
      'Move root',
      (s) => ({ pose: { ...s.pose, rootTransform: { position: [...t.position], rotation: [...t.rotation] } } }),
      opts,
    ),
})
