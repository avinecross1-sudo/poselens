// Rest-pose body measurements for the head-unit overlay. All values in meters, from the rig alone
// (the posed figure is not used, so numbers do not change while posing).
import { HAND_LENGTH_PER_PALM, type Rig } from '../three/bodyRig'
import type { JointName, Side } from '../types/scene'

export interface LimbLengths {
  label: string
  bones: { name: string; length: number }[]
  total: number
}

export interface Measurements {
  /** Floor to crown at rest. */
  height: number
  /** One head unit = crown to chin. */
  headUnit: number
  /** height / headUnit, e.g. 7.6. */
  heads: number
  /** Distance between the two shoulder (upper-arm) joints. */
  shoulderWidth: number
  /** Outer width of the pelvis block. */
  hipWidth: number
  /** Crown height of each head-unit tick, from the top down; last tick may be below the floor. */
  ticks: number[]
}

const len = (v: readonly number[]): number => Math.hypot(...v)

export function measure(rig: Rig): Measurements {
  const head = rig.head.segment
  if (head.shape !== 'sphere') throw new Error('head segment must be a sphere')
  const neckTop = rig.hips.offset[1] + rig.spine.offset[1] + rig.chest.offset[1] + rig.neck.offset[1] + rig.head.offset[1]
  const height = neckTop + head.center[1] + head.radius
  const headUnit = head.radius * 2
  const hips = rig.hips.segment
  const ticks: number[] = []
  for (let y = height; y > -1e-9; y -= headUnit) ticks.push(y)
  return {
    height,
    headUnit,
    heads: height / headUnit,
    shoulderWidth: Math.abs(rig.shoulderL.offset[0] + rig.upperArmL.offset[0] - (rig.shoulderR.offset[0] + rig.upperArmR.offset[0])),
    hipWidth: hips.shape === 'box' ? hips.size[0] : 0,
    ticks,
  }
}

function palmLength(rig: Rig, j: JointName): number {
  const s = rig[j].segment
  return s.shape === 'box' ? s.size[1] : 0
}

/** Bone lengths for the arm or leg containing `joint`, or null for torso/head joints. */
export function limbLengths(rig: Rig, joint: JointName): LimbLengths | null {
  const side = joint.slice(-1) as Side
  if (side !== 'L' && side !== 'R') return null
  const base = joint.slice(0, -1)
  const n = (b: string) => `${b}${side}` as JointName
  const word = side === 'L' ? 'Left' : 'Right'
  if (['shoulder', 'upperArm', 'forearm', 'hand'].includes(base)) {
    const bones = [
      { name: 'Upper arm', length: len(rig[n('forearm')].offset) },
      { name: 'Forearm', length: len(rig[n('hand')].offset) },
      { name: 'Hand', length: palmLength(rig, n('hand')) * HAND_LENGTH_PER_PALM },
    ]
    return { label: `${word} arm`, bones, total: bones.reduce((a, b) => a + b.length, 0) }
  }
  if (['thigh', 'shin', 'foot', 'toe'].includes(base)) {
    const foot = rig[n('foot')].segment
    const bones = [
      { name: 'Thigh', length: len(rig[n('shin')].offset) },
      { name: 'Shin', length: len(rig[n('foot')].offset) },
      { name: 'Foot', length: foot.shape === 'box' ? foot.size[2] : 0 },
    ]
    // Leg total = hip joint to floor, the length artists compare against head units.
    const total = bones[0]!.length + bones[1]!.length + (foot.shape === 'box' ? foot.size[1] : 0)
    return { label: `${word} leg`, bones, total }
  }
  return null
}
