// Per-joint rotation limits, per Euler axis (XYZ order), in degrees for readability.
// Conventions (bodyRig.ts): character faces +Z, left = +X, limbs hang along -Y.
//   +rx on a hanging limb swings it backward (-Z); -rx swings it forward.
//   +rz on a hanging limb swings it toward +X, so abduction is +rz on the left and -rz on the right.
//   +rx on the spine/neck tilts the upper body forward. +rx on a foot points the toes down.
// These are approximate human ranges, chosen so IK never produces an anatomically broken limb.
import { degToRad } from '../lib/units'
import { JOINT_NAMES, type JointName, type JointRotation, type PoseState } from '../types/scene'

type Range = readonly [min: number, max: number]
interface LimitDeg {
  rx: Range
  ry: Range
  rz: Range
}

const FREE: Range = [-180, 180]

/** Left-side limits; right-side limits mirror them (ry and rz negate). */
const LEFT_LIMITS_DEG: Record<string, LimitDeg> = {
  shoulder: { rx: [-15, 15], ry: [-20, 20], rz: [-10, 30] },
  upperArm: { rx: [-180, 60], ry: [-90, 90], rz: [-45, 180] },
  forearm: { rx: [-150, 0], ry: [-90, 90], rz: [-5, 5] },
  hand: { rx: [-80, 80], ry: [-25, 25], rz: [-35, 35] },
  thigh: { rx: [-125, 30], ry: [-45, 45], rz: [-30, 70] },
  shin: { rx: [0, 150], ry: [-10, 10], rz: [-5, 5] },
  foot: { rx: [-30, 50], ry: [-30, 30], rz: [-25, 25] },
  toe: { rx: [-60, 30], ry: [-5, 5], rz: [-5, 5] },
}

const CENTER_LIMITS_DEG: Record<string, LimitDeg> = {
  hips: { rx: FREE, ry: FREE, rz: FREE },
  spine: { rx: [-30, 45], ry: [-30, 30], rz: [-25, 25] },
  chest: { rx: [-20, 40], ry: [-30, 30], rz: [-20, 20] },
  neck: { rx: [-40, 50], ry: [-60, 60], rz: [-35, 35] },
  head: { rx: [-30, 30], ry: [-30, 30], rz: [-20, 20] },
}

const neg = (r: Range): Range => [-r[1], -r[0]]

function limitDeg(joint: JointName): LimitDeg {
  const center = CENTER_LIMITS_DEG[joint]
  if (center) return center
  const base = joint.slice(0, -1)
  const left = LEFT_LIMITS_DEG[base]
  if (!left) throw new Error(`No joint limits for ${joint}`)
  return joint.endsWith('L') ? left : { rx: left.rx, ry: neg(left.ry), rz: neg(left.rz) }
}

export interface JointLimit {
  rx: Range
  ry: Range
  rz: Range
}

const toRad = (r: Range): Range => [degToRad(r[0]), degToRad(r[1])]

export const JOINT_LIMITS: Record<JointName, JointLimit> = Object.fromEntries(
  JOINT_NAMES.map((j) => {
    const d = limitDeg(j)
    return [j, { rx: toRad(d.rx), ry: toRad(d.ry), rz: toRad(d.rz) }]
  }),
) as Record<JointName, JointLimit>

/** Rotations within this many radians of a limit still count as inside it (float noise). */
export const LIMIT_TOLERANCE_RAD = 1e-6

const clampAxis = (v: number, r: Range): number => Math.min(r[1], Math.max(r[0], v))

export function clampRotation(joint: JointName, rot: JointRotation): JointRotation {
  const l = JOINT_LIMITS[joint]
  return { rx: clampAxis(rot.rx, l.rx), ry: clampAxis(rot.ry, l.ry), rz: clampAxis(rot.rz, l.rz) }
}

export function withinLimits(joint: JointName, rot: JointRotation, tol = LIMIT_TOLERANCE_RAD): boolean {
  const l = JOINT_LIMITS[joint]
  const ok = (v: number, r: Range): boolean => v >= r[0] - tol && v <= r[1] + tol
  return ok(rot.rx, l.rx) && ok(rot.ry, l.ry) && ok(rot.rz, l.rz)
}

export function limitViolations(pose: Pick<PoseState, 'joints'>, tol = LIMIT_TOLERANCE_RAD): JointName[] {
  return JOINT_NAMES.filter((j) => !withinLimits(j, pose.joints[j], tol))
}
