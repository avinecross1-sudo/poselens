// Depth nudge (Phase 3C): push one joint nearer the viewer or farther away after a solve, keeping bone lengths.
// Depth is view depth along the shot camera's axis (m); + = away from the viewer.
//   Elbow / knee   The limb swings about the line from shoulder (hip) to wrist (ankle): the wrist stays put and
//                  the elbow moves on its circle. The swing angle that gives the asked depth change is solved in
//                  closed form. A nearly straight limb (or what a capped swing cannot reach) is made up
//                  by tipping the upper bone toward the deeper point (the wrist then moves with it).
//   Wrist / ankle  The joint is moved along its own camera ray (so it stays on the drawing) and the limb follows
//                  by CCD IK (solver-spec §3, limits and locks enforced).
//   Head           The neck turns so the head moves along its ray, at the neck's bone length.
// Every rotation is clamped to its joint limits, so the depth reached can fall short of the one asked for;
// the change actually made is returned. Pure math over the rig, no store.
import { Quaternion, Vector3 } from 'three'
import { PARENT, type Rig } from '../three/bodyRig'
import type { CameraState, JointName, JointRotation, RootTransform } from '../types/scene'
import { forwardKinematics, jointPosition, quatToRotation, rotationQuat, type WorldPose } from './fk'
import { chainMembers, IK_CHAINS, solveIk, type IkChainId } from './ik'
import { clampRotation } from './jointLimits'
import { clamp } from '../lib/units'
import { cameraModel, viewDepth, viewDir } from './projection'

/** Joints that carry a nudge handle, mid joints first (the order nudges are re-applied after a solve). */
export const NUDGE_JOINTS = ['forearmL', 'forearmR', 'shinL', 'shinR', 'handL', 'handR', 'footL', 'footR', 'head'] as const
export type NudgeJoint = (typeof NUDGE_JOINTS)[number]
export const isNudgeJoint = (j: string): j is NudgeJoint => (NUDGE_JOINTS as readonly string[]).includes(j)

/** One click on a nudge handle (m). */
export const NUDGE_STEP_M = 0.02
/** Accumulated nudges are kept within this (m) of the solved depth. */
export const MAX_NUDGE_M = 0.6
/** Below this (m) a lever, circle radius or depth change is treated as zero. */
const EPS = 1e-6
/**
 * Tipping the upper bone toward a deeper point moves the joint on a sphere, so each step gets only part of the way:
 * up to this many steps, until the depth is within TIP_TOLERANCE_M (or a joint limit stops it).
 */
const TIP_ITERATIONS = 6
/**
 * Largest swing of the limb about the shoulder–wrist (hip–ankle) line in one nudge. On a nearly straight limb the
 * circle is tiny and the closed-form angle can be most of a turn for a small depth change, which would flip the
 * elbow over; past this the rest is made up by tipping instead.
 */
const MAX_SWING_RAD = Math.PI / 6
/** Below this bend (rad) at the elbow / knee the limb counts as straight: it is tipped, not swung. */
const MIN_SWING_BEND_RAD = (25 * Math.PI) / 180
const TIP_TOLERANCE_M = 1e-4

type Kind = { kind: 'swing'; chain: IkChainId } | { kind: 'ray'; chain: IkChainId } | { kind: 'aim'; mover: JointName }

const KIND: Record<NudgeJoint, Kind> = {
  forearmL: { kind: 'swing', chain: 'armL' },
  forearmR: { kind: 'swing', chain: 'armR' },
  shinL: { kind: 'swing', chain: 'legL' },
  shinR: { kind: 'swing', chain: 'legR' },
  handL: { kind: 'ray', chain: 'armL' },
  handR: { kind: 'ray', chain: 'armR' },
  footL: { kind: 'ray', chain: 'legL' },
  footR: { kind: 'ray', chain: 'legR' },
  head: { kind: 'aim', mover: 'neck' },
}

/** The joints a nudge of `j` can rotate (for the ghost preview and lock checks). */
export function nudgeLimb(j: NudgeJoint): JointName[] {
  const k = KIND[j]
  if (k.kind === 'aim') return [k.mover, j]
  const legToe: JointName[] = k.chain === 'legL' ? ['toeL'] : k.chain === 'legR' ? ['toeR'] : []
  return [...chainMembers(k.chain), ...legToe]
}

/** Joints a nudge of `j` actually rotates; a nudge is refused when one of them, or `j` itself, is locked. */
export function nudgeMovers(j: NudgeJoint): JointName[] {
  const k = KIND[j]
  if (k.kind === 'aim') return [k.mover]
  if (k.kind === 'swing') return [PARENT[IK_CHAINS[k.chain].hinge.joint] as JointName]
  return [...IK_CHAINS[k.chain].joints]
}

/** A nudge is refused when the joint, or a joint it would rotate, is locked. */
export const nudgeBlocked = (locked: ReadonlySet<JointName>, j: NudgeJoint): boolean => locked.has(j) || nudgeMovers(j).some((m) => locked.has(m))

export interface NudgeInput {
  rig: Rig
  joints: Record<JointName, JointRotation>
  root: RootTransform
  camera: CameraState
  joint: NudgeJoint
  /** Asked change of view depth (m), + = away from the viewer. */
  delta: number
  locked: ReadonlySet<JointName>
}

export interface NudgeResult {
  joints: Record<JointName, JointRotation>
  /** View-depth change actually made (m). */
  moved: number
}

const worldQuat = (world: WorldPose, j: JointName): Quaternion => {
  const q = new Quaternion()
  world[j].decompose(new Vector3(), q, new Vector3())
  return q
}

/** World rotation of a node's parent frame at the node (its world rotation without its own local rotation). */
const parentQuat = (world: WorldPose, joints: Record<JointName, JointRotation>, j: JointName): Quaternion =>
  worldQuat(world, j).multiply(rotationQuat(joints[j]).invert())

/** Local rotation of `j` after a world-space turn `delta` about the joint. */
function turned(world: WorldPose, joints: Record<JointName, JointRotation>, j: JointName, delta: Quaternion): JointRotation {
  const parent = parentQuat(world, joints, j)
  const w = delta.clone().multiply(worldQuat(world, j))
  return clampRotation(j, quatToRotation(parent.invert().multiply(w)))
}

/**
 * Swing angle about `axis` that changes the depth of a point on a circle by `delta`. The point is
 * c + r(u cos θ + w sin θ); its depth change is A(cos θ − 1) + B sin θ with A = r v·u, B = r v·w.
 * Solving A cos θ + B sin θ = delta + A gives θ = φ ± acos((delta + A)/R), R = hypot(A, B), φ = atan2(B, A).
 * The smaller turn is taken; past the circle's reach, the nearest extreme.
 */
export function swingAngle(a: number, b: number, delta: number): number {
  const r = Math.hypot(a, b)
  if (r < EPS) return 0
  const k = Math.min(1, Math.max(-1, (delta + a) / r))
  const phi = Math.atan2(b, a)
  const wrap = (t: number): number => Math.atan2(Math.sin(t), Math.cos(t))
  const t1 = wrap(phi + Math.acos(k))
  const t2 = wrap(phi - Math.acos(k))
  return Math.abs(t1) <= Math.abs(t2) ? t1 : t2
}

export function nudgeDepth(input: NudgeInput): NudgeResult {
  const { rig, root, joint, delta, locked } = input
  const joints = { ...input.joints }
  const unchanged: NudgeResult = { joints, moved: 0 }
  if (Math.abs(delta) < EPS || nudgeBlocked(locked, joint)) return unchanged
  const cam = cameraModel(input.camera)
  const view = viewDir(cam)
  let world = forwardKinematics(rig, joints, root)
  const start = jointPosition(world, joint)
  const startDepth = viewDepth(cam, start)
  // A point on the joint's own ray, `delta` deeper: the joint stays where the drawing has it.
  const rayDir = start.clone().sub(cam.position).normalize()
  const alongRay = start.clone().addScaledVector(rayDir, delta / Math.max(EPS, rayDir.dot(view)))
  const k = KIND[joint]

  if (k.kind === 'swing') {
    const upper = PARENT[IK_CHAINS[k.chain].hinge.joint] as JointName
    const base = jointPosition(world, upper)
    const end = jointPosition(world, IK_CHAINS[k.chain].effector)
    const axis = end.clone().sub(base)
    const bend = start.clone().sub(base).angleTo(end.clone().sub(start))
    if (axis.length() > EPS && bend >= MIN_SWING_BEND_RAD) {
      axis.normalize()
      const c = base.clone().addScaledVector(axis, start.clone().sub(base).dot(axis))
      const u = start.clone().sub(c)
      const r = u.length()
      if (r > EPS) {
        u.normalize()
        const w = new Vector3().crossVectors(axis, u)
        const theta = clamp(swingAngle(r * view.dot(u), r * view.dot(w), delta), -MAX_SWING_RAD, MAX_SWING_RAD)
        joints[upper] = turned(world, joints, upper, new Quaternion().setFromAxisAngle(axis, theta))
        world = forwardKinematics(rig, joints, root)
      }
    }
    // A nearly straight limb has little circle to swing on: tip the upper bone toward the deeper point for the rest
    // (the wrist / ankle then moves with it).
    for (let i = 0; i < TIP_ITERATIONS; i++) {
      const pos = jointPosition(world, joint)
      const remaining = startDepth + delta - viewDepth(cam, pos)
      if (Math.abs(remaining) < TIP_TOLERANCE_M) break
      const dir = pos.clone().sub(cam.position).normalize()
      const want = pos.clone().addScaledVector(dir, remaining / Math.max(EPS, dir.dot(view)))
      const from = pos.clone().sub(base)
      const to = want.sub(base)
      if (from.length() < EPS || to.length() < EPS) break
      joints[upper] = turned(world, joints, upper, new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()))
      world = forwardKinematics(rig, joints, root)
    }
  } else if (k.kind === 'ray') {
    const r = solveIk({ rig, joints, root, chain: k.chain, target: alongRay, locked })
    Object.assign(joints, r.joints)
    world = forwardKinematics(rig, joints, root)
  } else {
    const pivot = jointPosition(world, k.mover)
    const from = start.clone().sub(pivot)
    const to = alongRay.clone().sub(pivot)
    if (from.length() > EPS && to.length() > EPS) {
      joints[k.mover] = turned(world, joints, k.mover, new Quaternion().setFromUnitVectors(from.normalize(), to.normalize()))
      world = forwardKinematics(rig, joints, root)
    }
  }
  return { joints, moved: viewDepth(cam, jointPosition(world, joint)) - startDepth }
}

/** Re-applies recorded nudges (mid joints first), e.g. after a re-solve. `only` limits which joints are replayed. */
export function applyNudges(
  base: Omit<NudgeInput, 'joint' | 'delta'>,
  nudges: Readonly<Record<string, number>>,
  only: ReadonlySet<JointName> | null = null,
): Record<JointName, JointRotation> {
  let joints = base.joints
  for (const j of NUDGE_JOINTS) {
    const d = nudges[j]
    if (d === undefined || d === 0 || (only && !only.has(j))) continue
    joints = nudgeDepth({ ...base, joints, joint: j, delta: d }).joints
  }
  return joints
}
