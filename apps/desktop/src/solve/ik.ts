// Limb IK by Cyclic Coordinate Descent (docs/solver-spec.md §3).
// Each iteration first sets the elbow/knee bend so the limb is as long as the distance to the target
// (law of cosines), then swings the remaining joints tip to root so the effector points at it.
// Every joint is clamped to its limits after each step, so the result never leaves the joint-limit
// box no matter where the target is. Plain CCD stalls on a straight hinge; the bend step avoids that.
import { Matrix4, Quaternion, Vector3 } from 'three'
import { PARENT, type Rig } from '../three/bodyRig'
import type { JointName, JointRotation, RootTransform } from '../types/scene'
import { forwardKinematics, jointPosition, quatToRotation, rotationQuat } from './fk'
import { clampRotation } from './jointLimits'

/** solver-spec §3: CCD, 8 iterations max. */
export const IK_MAX_ITERATIONS = 8
/** Effector within this distance (m) of the target counts as reached. */
export const IK_REACH_TOLERANCE_M = 0.005
/** Vectors shorter than this (m) give no usable direction; that joint is skipped for the step. */
const MIN_LEVER_M = 1e-5

export const IK_CHAIN_IDS = ['armL', 'armR', 'legL', 'legR'] as const
export type IkChainId = (typeof IK_CHAIN_IDS)[number]

export interface IkChain {
  label: string
  /** Rotated joints, root of the chain first (solver-spec: shoulder→upperArm→forearm→hand). */
  joints: readonly JointName[]
  /** The node whose origin is dragged: wrist (hand) or ankle (foot). */
  effector: JointName
  /** Elbow or knee: bends about its own X axis; sign of rx that bends it naturally. */
  hinge: { joint: JointName; bendSign: 1 | -1 }
}

export const IK_CHAINS: Record<IkChainId, IkChain> = {
  armL: { label: 'Left arm', joints: ['shoulderL', 'upperArmL', 'forearmL'], effector: 'handL', hinge: { joint: 'forearmL', bendSign: -1 } },
  armR: { label: 'Right arm', joints: ['shoulderR', 'upperArmR', 'forearmR'], effector: 'handR', hinge: { joint: 'forearmR', bendSign: -1 } },
  legL: { label: 'Left leg', joints: ['thighL', 'shinL'], effector: 'footL', hinge: { joint: 'shinL', bendSign: 1 } },
  legR: { label: 'Right leg', joints: ['thighR', 'shinR'], effector: 'footR', hinge: { joint: 'shinR', bendSign: 1 } },
}

/** Every joint a chain lock freezes: the rotated joints plus the effector itself. */
export const chainMembers = (id: IkChainId): JointName[] => [...IK_CHAINS[id].joints, IK_CHAINS[id].effector]

export const chainOf = (joint: JointName): IkChainId | null =>
  IK_CHAIN_IDS.find((id) => chainMembers(id).includes(joint)) ?? null

export interface IkInput {
  rig: Rig
  joints: Record<JointName, JointRotation>
  root: RootTransform
  stylize?: Matrix4 | null
  chain: IkChainId
  target: Vector3
  /** Joints IK must not rotate. */
  locked?: ReadonlySet<string>
}

export interface IkResult {
  joints: Record<JointName, JointRotation>
  /** Final effector-to-target distance, m. */
  error: number
  reached: boolean
  iterations: number
}

export function solveIk(input: IkInput): IkResult {
  const { rig, root, chain, target } = input
  const stylize = input.stylize ?? null
  const locked = input.locked ?? new Set<string>()
  const joints = { ...input.joints }
  const { joints: chainJoints, effector, hinge } = IK_CHAINS[chain]
  const fk = () => forwardKinematics(rig, joints, root, stylize)

  let world = fk()
  // Hinge geometry: upper segment (base joint -> hinge) and lower segment (hinge -> effector).
  const hingeBase = PARENT[hinge.joint] as JointName
  const upper = new Vector3(...rig[hinge.joint].offset).length()
  const lower = new Vector3(...rig[effector].offset).length()
  let error = jointPosition(world, effector).distanceTo(target)
  let iterations = 0
  const parentRot = new Quaternion()
  const tmpPos = new Vector3()
  const tmpScale = new Vector3()

  while (iterations < IK_MAX_ITERATIONS && error > IK_REACH_TOLERANCE_M) {
    iterations++
    if (!locked.has(hinge.joint)) {
      joints[hinge.joint] = clampRotation(hinge.joint, {
        ...joints[hinge.joint],
        rx: hinge.bendSign * hingeAngle(upper, lower, jointPosition(world, hingeBase).distanceTo(target)),
      })
      world = fk()
    }
    // Then swing the other joints tip to root, as CCD prescribes.
    for (let i = chainJoints.length - 1; i >= 0; i--) {
      const j = chainJoints[i] as JointName
      if (j === hinge.joint || locked.has(j)) continue
      const pivot = jointPosition(world, j)
      const toEffector = jointPosition(world, effector).sub(pivot)
      const toTarget = target.clone().sub(pivot)
      if (toEffector.length() < MIN_LEVER_M || toTarget.length() < MIN_LEVER_M) continue
      const delta = new Quaternion().setFromUnitVectors(toEffector.normalize(), toTarget.normalize())

      // local' = parent⁻¹ · delta · parent · local  (delta acts in world space about the joint).
      world[j].clone().multiply(rotationMatrixInverse(joints[j])).decompose(tmpPos, parentRot, tmpScale)
      const local = parentRot.clone().invert().multiply(delta).multiply(parentRot).multiply(rotationQuat(joints[j]))
      joints[j] = clampRotation(j, quatToRotation(local))
      world = fk()
    }
    error = jointPosition(world, effector).distanceTo(target)
  }
  return { joints, error, reached: error <= IK_REACH_TOLERANCE_M, iterations }
}

/**
 * Bend (0 = straight) that puts the effector `d` from the hinge's parent joint, by the law of cosines:
 * d² = a² + b² + 2ab·cos(bend). Distances outside [|a−b|, a+b] give fully bent / straight.
 */
export function hingeAngle(a: number, b: number, d: number): number {
  const c = (d * d - a * a - b * b) / (2 * a * b)
  return Math.acos(Math.min(1, Math.max(-1, c)))
}

/** Matrix that undoes a joint's own rotation, so world · this = parent frame at the joint. */
function rotationMatrixInverse(r: JointRotation): Matrix4 {
  return new Matrix4().makeRotationFromQuaternion(rotationQuat(r).invert())
}
