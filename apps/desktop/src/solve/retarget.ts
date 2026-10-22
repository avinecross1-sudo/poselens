// Pose retargeting onto a different body: rotations are kept as-is, bone lengths come from the new
// rig, and the root height is corrected so a grounded pose stays on the ground. Poses that cannot
// carry over cleanly (joint limits, a foot lifting off, the body sinking into the floor) are flagged.
import type { Matrix4 } from 'three'
import type { Rig } from '../three/bodyRig'
import type { JointName, PoseState } from '../types/scene'
import { bodySamples, forwardKinematics, lowestPoint } from './fk'
import { limitViolations } from './jointLimits'

/** balance-spec: a point within 2 cm of the ground plane is in contact. */
export const GROUND_CONTACT_M = 0.02
/** Sinking deeper than this below the ground is reported. */
export const GROUND_PENETRATION_M = 0.02
const CM_PER_M = 100

const FEET: readonly { label: string; joints: readonly JointName[] }[] = [
  { label: 'Left foot', joints: ['footL', 'toeL'] },
  { label: 'Right foot', joints: ['footR', 'toeR'] },
]

const withRootY = (pose: PoseState, y: number): PoseState => ({
  ...pose,
  rootTransform: { ...pose.rootTransform, position: [pose.rootTransform.position[0], y, pose.rootTransform.position[2]] },
})

const lowest = (rig: Rig, pose: PoseState, stylize: Matrix4 | null): number =>
  lowestPoint(rig, forwardKinematics(rig, pose.joints, pose.rootTransform, stylize))

/** Moves the root vertically so the lowest body point sits `lift` meters above the ground. */
export function groundPose(rig: Rig, pose: PoseState, lift = 0, stylize: Matrix4 | null = null): PoseState {
  return withRootY(pose, pose.rootTransform.position[1] + lift - lowest(rig, pose, stylize))
}

/**
 * Same body, new pose: if `prev` touched the ground, shift `next` vertically so its lowest point
 * sits where prev's did (a tiptoe raises the body instead of sinking the toes).
 */
export function preserveGroundContact(rig: Rig, prev: PoseState, next: PoseState, stylize: Matrix4 | null = null): PoseState {
  const before = lowest(rig, prev, stylize)
  if (before > GROUND_CONTACT_M) return next
  return withRootY(next, next.rootTransform.position[1] + before - lowest(rig, next, stylize))
}

function footLows(rig: Rig, pose: PoseState, stylize: Matrix4 | null): number[] {
  const samples = bodySamples(rig, forwardKinematics(rig, pose.joints, pose.rootTransform, stylize))
  return FEET.map((f) => Math.min(...f.joints.flatMap((j) => samples[j].map((p) => p.y))))
}

/** Problems a pose has on a given body. `before` (same pose on the previous body) enables foot-lift checks. */
export function poseWarnings(
  rig: Rig,
  pose: PoseState,
  stylize: Matrix4 | null = null,
  before?: { rig: Rig; pose: PoseState; stylize?: Matrix4 | null },
): string[] {
  const warnings: string[] = []
  const bad = limitViolations(pose)
  if (bad.length) warnings.push(`Outside joint limits: ${bad.join(', ')}`)

  const low = lowest(rig, pose, stylize)
  if (low < -GROUND_PENETRATION_M) warnings.push(`Body passes ${(-low * CM_PER_M).toFixed(1)} cm into the ground`)

  if (before) {
    const was = footLows(before.rig, before.pose, before.stylize ?? null)
    const now = footLows(rig, pose, stylize)
    FEET.forEach((f, i) => {
      const w = was[i] as number
      const n = now[i] as number
      if (w <= GROUND_CONTACT_M && n > GROUND_CONTACT_M) {
        warnings.push(`${f.label} lifts ${(n * CM_PER_M).toFixed(1)} cm off the ground on this body`)
      }
    })
  }
  return warnings
}

export interface RetargetResult {
  pose: PoseState
  warnings: string[]
}

export function retargetPose(
  pose: PoseState,
  fromRig: Rig,
  toRig: Rig,
  stylize: { from?: Matrix4 | null; to?: Matrix4 | null } = {},
): RetargetResult {
  const sFrom = stylize.from ?? null
  const sTo = stylize.to ?? null
  const before = lowest(fromRig, pose, sFrom)
  let out = pose
  // Grounded poses keep their contact height; airborne poses keep their root where it was.
  if (before <= GROUND_CONTACT_M) {
    const after = lowest(toRig, pose, sTo)
    out = withRootY(pose, pose.rootTransform.position[1] + (before - after))
  }
  return { pose: out, warnings: poseWarnings(toRig, out, sTo, { rig: fromRig, pose, stylize: sFrom }) }
}
