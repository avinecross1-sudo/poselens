// Forward kinematics over the rig, matching how mannequin.ts builds the Object3D tree.
// Uses Three.js math classes only (no scene graph), so it runs under vitest.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { SKELETON, type Rig, type Segment } from '../three/bodyRig'
import { JOINT_EULER_ORDER, type JointName, type JointRotation, type PoseState, type RootTransform, type StylizedOverride } from '../types/scene'

export type WorldPose = Record<JointName, Matrix4>

const UNIT = new Vector3(1, 1, 1)

export const rotationQuat = (r: JointRotation): Quaternion => new Quaternion().setFromEuler(new Euler(r.rx, r.ry, r.rz, JOINT_EULER_ORDER))

export function quatToRotation(q: Quaternion): JointRotation {
  const e = new Euler().setFromQuaternion(q, JOINT_EULER_ORDER)
  return { rx: e.x, ry: e.y, rz: e.z }
}

/** The stylized matrix, or null when there is none or it has not been acknowledged. */
export function activeStylizeMatrix(o: StylizedOverride | null): Matrix4 | null {
  if (!o || !o.acknowledged || o.matrix.length !== 16) return null
  return new Matrix4().fromArray(o.matrix)
}

export function rootMatrix(t: RootTransform, stylize: Matrix4 | null = null): Matrix4 {
  const [rx, ry, rz] = t.rotation
  const m = new Matrix4().compose(new Vector3(...t.position), new Quaternion().setFromEuler(new Euler(rx, ry, rz, JOINT_EULER_ORDER)), UNIT)
  return stylize ? m.premultiply(stylize) : m
}

export function forwardKinematics(
  rig: Rig,
  joints: Record<JointName, JointRotation>,
  root: RootTransform,
  stylize: Matrix4 | null = null,
): WorldPose {
  const rootM = rootMatrix(root, stylize)
  const world = {} as WorldPose
  for (const b of SKELETON) {
    const local = new Matrix4().compose(new Vector3(...rig[b.name].offset), rotationQuat(joints[b.name]), UNIT)
    const parent = b.parent === 'root' ? rootM : world[b.parent]
    world[b.name] = parent.clone().multiply(local)
  }
  return world
}

export const posePositions = (rig: Rig, pose: PoseState, stylize: Matrix4 | null = null): WorldPose =>
  forwardKinematics(rig, pose.joints, pose.rootTransform, stylize)

export const jointPosition = (world: WorldPose, j: JointName): Vector3 => new Vector3().setFromMatrixPosition(world[j])

/** Points on a segment's surface in its node's local frame: box corners, capsule/sphere extremes. */
export function segmentSamples(seg: Segment): Vector3[] {
  const pts: Vector3[] = []
  const ball = (c: Vector3, r: number): void => {
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      pts.push(new Vector3(c.x + d[0] * r, c.y + d[1] * r, c.z + d[2] * r))
    }
  }
  if (seg.shape === 'box') {
    const [sx, sy, sz] = seg.size
    for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
      pts.push(new Vector3(seg.center[0] + x * sx, seg.center[1] + y * sy, seg.center[2] + z * sz))
    }
  } else if (seg.shape === 'capsule') {
    const dir = new Vector3(...seg.dir).normalize()
    ball(new Vector3(), seg.radius)
    ball(dir.multiplyScalar(seg.length), seg.radius)
  } else {
    ball(new Vector3(...seg.center), seg.radius)
  }
  return pts
}

/** World-space surface samples for every segment, keyed by joint. */
export function bodySamples(rig: Rig, world: WorldPose): Record<JointName, Vector3[]> {
  const out = {} as Record<JointName, Vector3[]>
  for (const b of SKELETON) out[b.name] = segmentSamples(rig[b.name].segment).map((p) => p.applyMatrix4(world[b.name]))
  return out
}

/** Lowest world Y of the whole body. */
export function lowestPoint(rig: Rig, world: WorldPose): number {
  let min = Infinity
  for (const pts of Object.values(bodySamples(rig, world))) for (const p of pts) min = Math.min(min, p.y)
  return min
}
