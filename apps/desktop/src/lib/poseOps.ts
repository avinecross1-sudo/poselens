// Pure pose operations: locks, mirror, blend, hand and foot presets.
import { Euler, Quaternion, Vector3 } from 'three'
import { chainMembers, IK_CHAIN_IDS, type IkChainId } from '../solve/ik'
import { JOINT_LIMITS } from '../solve/jointLimits'
import { JOINT_EULER_ORDER, JOINT_NAMES, type JointName, type JointRotation, type PoseState, type Side, type Vec3 } from '../types/scene'
import { degToRad } from './units'

// ---- Locks ----

/** Joints locked directly or through a locked limb chain. */
export function lockedJoints(pose: Pick<PoseState, 'jointLocks' | 'ikLocks'>): Set<JointName> {
  const out = new Set<JointName>()
  for (const j of pose.jointLocks) if ((JOINT_NAMES as readonly string[]).includes(j)) out.add(j as JointName)
  for (const c of pose.ikLocks) if ((IK_CHAIN_IDS as readonly string[]).includes(c)) for (const j of chainMembers(c as IkChainId)) out.add(j)
  return out
}

/** Takes `next` joint rotations but keeps every locked joint at its `current` value. */
export function keepLocked(
  current: PoseState,
  next: Record<JointName, JointRotation>,
  locked: ReadonlySet<JointName> = lockedJoints(current),
): Record<JointName, JointRotation> {
  const out = { ...next }
  for (const j of locked) out[j] = { ...current.joints[j] }
  return out
}

// ---- Mirror ----

/** thighL <-> thighR; centre joints map to themselves. */
export function mirrorJointName(j: JointName): JointName {
  if (j.endsWith('L')) return `${j.slice(0, -1)}R` as JointName
  if (j.endsWith('R')) return `${j.slice(0, -1)}L` as JointName
  return j
}

/** Reflection across the body's mid-plane (x -> -x) keeps rx and negates ry and rz for Euler XYZ. */
const mirrorRotation = (r: JointRotation): JointRotation => ({ rx: r.rx, ry: -r.ry, rz: -r.rz })

export function mirrorPose(pose: PoseState): PoseState {
  const locked = lockedJoints(pose)
  const joints = {} as Record<JointName, JointRotation>
  for (const j of JOINT_NAMES) joints[j] = mirrorRotation(pose.joints[mirrorJointName(j)])
  const [px, py, pz] = pose.rootTransform.position
  const [rx, ry, rz] = pose.rootTransform.rotation
  return {
    ...pose,
    joints: keepLocked(pose, joints, locked),
    hands: {
      L: locked.has('handL') ? pose.hands.L : pose.hands.R,
      R: locked.has('handR') ? pose.hands.R : pose.hands.L,
    },
    rootTransform: { position: [-px, py, pz], rotation: [rx, -ry, -rz] },
  }
}

// ---- Blend ----

const toQuat = (r: JointRotation): Quaternion => new Quaternion().setFromEuler(new Euler(r.rx, r.ry, r.rz, JOINT_EULER_ORDER))
const fromQuat = (q: Quaternion): JointRotation => {
  const e = new Euler().setFromQuaternion(q, JOINT_EULER_ORDER)
  return { rx: e.x, ry: e.y, rz: e.z }
}

/** Shortest-arc rotation blend; t = 0 gives a, t = 1 gives b. */
export function slerpRotation(a: JointRotation, b: JointRotation, t: number): JointRotation {
  if (t <= 0) return { ...a }
  if (t >= 1) return { ...b }
  return fromQuat(toQuat(a).slerp(toQuat(b), t))
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const v = new Vector3(...a).lerp(new Vector3(...b), t)
  return [v.x, v.y, v.z]
}

/** Per-channel Euler blend. Inside a joint-limit box this stays inside it (the box is convex). */
export function lerpRotation(a: JointRotation, b: JointRotation, t: number): JointRotation {
  return { rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t, rz: a.rz + (b.rz - a.rz) * t }
}

const FULL_TURN = 2 * Math.PI
/** A joint whose limits cover a full turn on every axis (the hips) has no anatomical "way" to bend. */
const isFreeJoint = (j: JointName): boolean => Object.values(JOINT_LIMITS[j]).every(([lo, hi]) => hi - lo >= FULL_TURN - 1e-9)

/**
 * Blends pose `a` toward pose `b`. Limited joints blend per Euler channel, so they move the way
 * the joint bends and never leave their limits; free joints and the root use shortest-arc slerp.
 * Locks and settings come from `a` (the pose being edited), so locked joints stay at a's values.
 * Hand shapes switch at the halfway point.
 */
export function blendPoses(a: PoseState, b: PoseState, t: number): PoseState {
  const joints = {} as Record<JointName, JointRotation>
  for (const j of JOINT_NAMES) joints[j] = (isFreeJoint(j) ? slerpRotation : lerpRotation)(a.joints[j], b.joints[j], t)
  const rootRot = slerpRotation(
    { rx: a.rootTransform.rotation[0], ry: a.rootTransform.rotation[1], rz: a.rootTransform.rotation[2] },
    { rx: b.rootTransform.rotation[0], ry: b.rootTransform.rotation[1], rz: b.rootTransform.rotation[2] },
    t,
  )
  const locked = lockedJoints(a)
  const handAt = (s: Side) => (locked.has(`hand${s}`) || t < 0.5 ? a.hands[s] : b.hands[s])
  return {
    ...a,
    joints: keepLocked(a, joints, locked),
    hands: { L: handAt('L'), R: handAt('R') },
    rootTransform: { position: lerp3(a.rootTransform.position, b.rootTransform.position, t), rotation: [rootRot.rx, rootRot.ry, rootRot.rz] },
  }
}

// ---- Foot presets ----

export const FOOT_PRESETS = ['flat', 'tiptoe', 'heel', 'pointed'] as const
export type FootPreset = (typeof FOOT_PRESETS)[number]

/** Ankle (foot rx) and toe (toe rx) angles in degrees. +foot rx points the toes down; -toe rx bends toes up. */
export const FOOT_PRESET_ANGLES_DEG: Record<FootPreset, { foot: number; toe: number }> = {
  flat: { foot: 0, toe: 0 },
  tiptoe: { foot: 40, toe: -40 },
  heel: { foot: -25, toe: 0 },
  pointed: { foot: 50, toe: 20 },
}

/** Sets ankle pitch and toe bend; keeps the foot's toe direction (ry) and roll (rz). */
export function applyFootPreset(pose: PoseState, side: Side, preset: FootPreset): Record<JointName, JointRotation> {
  const a = FOOT_PRESET_ANGLES_DEG[preset]
  const foot: JointName = `foot${side}`
  const toe: JointName = `toe${side}`
  const next = {
    ...pose.joints,
    [foot]: { ...pose.joints[foot], rx: degToRad(a.foot) },
    [toe]: { ...pose.joints[toe], rx: degToRad(a.toe) },
  }
  return keepLocked(pose, next)
}

/** Toe direction = foot yaw. Positive turns the toes outward on either side. */
export function toeDirectionToRy(side: Side, outward: number): number {
  return side === 'L' ? outward : -outward
}
export function ryToToeDirection(side: Side, ry: number): number {
  return side === 'L' ? ry : -ry
}
