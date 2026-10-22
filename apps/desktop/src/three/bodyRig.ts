// Pure mapping from overall body sliders to bone offsets and segment sizes.
// No Three.js imports so it stays unit-testable; mannequin.ts applies the result.
import type { BodySliders, JointName, Vec3 } from '../types/scene'

/** Rest skeleton is authored for this height (CLAUDE.md default). */
export const REFERENCE_HEIGHT_M = 1.75
/** Reference slider values = "Realistic Average" preset; rest geometry is authored at these. */
export const REFERENCE_MASS = 0.5
export const REFERENCE_MUSCLE = 0.4
export const REFERENCE_SOFTNESS = 0.4
export const REFERENCE_SHOULDER_HIP_RATIO = 1.15

/** Girth change per unit of mass slider (1.0 mass ≈ +45% radius vs reference). */
export const MASS_GIRTH_GAIN = 0.9
/** Girth change per unit of softness slider; softness adds less width than mass. */
export const SOFTNESS_GIRTH_GAIN = 0.35
/** Extra limb and chest thickness per unit of muscle slider. */
export const MUSCLE_LIMB_GAIN = 0.5
/** Girth never shrinks below this fraction of reference, so slim presets stay solid. */
export const MIN_GIRTH = 0.6

export type BodyClass = 'torso' | 'chest' | 'arm' | 'leg' | 'head' | 'extremity'

export type Segment =
  | { shape: 'capsule'; dir: Vec3; length: number; radius: number }
  | { shape: 'box'; size: Vec3; center: Vec3 }
  | { shape: 'sphere'; radius: number; center: Vec3 }

export interface BoneDef {
  name: JointName
  parent: JointName | 'root'
  /** Offset from parent node at rest, meters. */
  offset: Vec3
  segment: Segment
  jointRadius: number
  cls: BodyClass
}

export interface RigBone {
  offset: Vec3
  segment: Segment
  jointRadius: number
}

export type Rig = Record<JointName, RigBone>

const capsule = (dir: Vec3, length: number, radius: number): Segment => ({ shape: 'capsule', dir, length, radius })
const box = (size: Vec3, center: Vec3): Segment => ({ shape: 'box', size, center })
const sphere = (radius: number, center: Vec3): Segment => ({ shape: 'sphere', radius, center })

function side(sign: 1 | -1, s: 'L' | 'R'): BoneDef[] {
  const n = <T extends string>(base: T) => `${base}${s}` as JointName
  return [
    { name: n('shoulder'), parent: 'chest', offset: [0.03 * sign, 0.22, 0], segment: capsule([sign, 0, 0], 0.15, 0.045), jointRadius: 0.04, cls: 'torso' },
    { name: n('upperArm'), parent: n('shoulder'), offset: [0.15 * sign, 0, 0], segment: capsule([0, -1, 0], 0.29, 0.045), jointRadius: 0.05, cls: 'arm' },
    { name: n('forearm'), parent: n('upperArm'), offset: [0, -0.29, 0], segment: capsule([0, -1, 0], 0.26, 0.038), jointRadius: 0.042, cls: 'arm' },
    { name: n('hand'), parent: n('forearm'), offset: [0, -0.26, 0], segment: box([0.04, 0.18, 0.09], [0, -0.09, 0]), jointRadius: 0.032, cls: 'extremity' },
    { name: n('thigh'), parent: 'hips', offset: [0.09 * sign, -0.05, 0], segment: capsule([0, -1, 0], 0.44, 0.075), jointRadius: 0.08, cls: 'leg' },
    { name: n('shin'), parent: n('thigh'), offset: [0, -0.44, 0], segment: capsule([0, -1, 0], 0.39, 0.055), jointRadius: 0.06, cls: 'leg' },
    { name: n('foot'), parent: n('shin'), offset: [0, -0.39, 0], segment: box([0.09, 0.07, 0.17], [0, -0.035, 0.045]), jointRadius: 0.045, cls: 'extremity' },
    { name: n('toe'), parent: n('foot'), offset: [0, -0.045, 0.13], segment: box([0.09, 0.05, 0.06], [0, 0, 0.03]), jointRadius: 0.025, cls: 'extremity' },
  ]
}

/** Rest skeleton at 1.75 m. Character faces +Z; character's left is +X. Feet rest on y = 0. */
export const SKELETON: readonly BoneDef[] = [
  { name: 'hips', parent: 'root', offset: [0, 0.95, 0], segment: box([0.3, 0.18, 0.18], [0, -0.02, 0]), jointRadius: 0.06, cls: 'torso' },
  { name: 'spine', parent: 'hips', offset: [0, 0.1, 0], segment: capsule([0, 1, 0], 0.18, 0.11), jointRadius: 0.05, cls: 'torso' },
  { name: 'chest', parent: 'spine', offset: [0, 0.18, 0], segment: box([0.34, 0.28, 0.2], [0, 0.13, 0]), jointRadius: 0.05, cls: 'chest' },
  { name: 'neck', parent: 'chest', offset: [0, 0.27, 0], segment: capsule([0, 1, 0], 0.06, 0.045), jointRadius: 0.04, cls: 'torso' },
  { name: 'head', parent: 'neck', offset: [0, 0.06, 0], segment: sphere(0.105, [0, 0.085, 0]), jointRadius: 0.035, cls: 'head' },
  ...side(1, 'L'),
  ...side(-1, 'R'),
]

const SHOULDER_WIDTH_BONES = new Set<JointName>(['upperArmL', 'upperArmR'])
const SHOULDER_SEGMENT_BONES = new Set<JointName>(['shoulderL', 'shoulderR'])
const HIP_WIDTH_BONES = new Set<JointName>(['thighL', 'thighR'])

export interface RigFactors {
  length: number
  girth: number
  muscle: number
  shoulderWidth: number
  hipWidth: number
}

export function rigFactors(s: BodySliders): RigFactors {
  const girth = Math.max(
    MIN_GIRTH,
    1 + MASS_GIRTH_GAIN * (s.mass - REFERENCE_MASS) + SOFTNESS_GIRTH_GAIN * (s.softness - REFERENCE_SOFTNESS),
  )
  const ratio = s.shoulderHipRatio / REFERENCE_SHOULDER_HIP_RATIO
  return {
    length: s.height / REFERENCE_HEIGHT_M,
    girth,
    muscle: Math.max(MIN_GIRTH, 1 + MUSCLE_LIMB_GAIN * (s.muscle - REFERENCE_MUSCLE)),
    // Split the ratio evenly between shoulders (wider) and hips (narrower).
    shoulderWidth: Math.sqrt(ratio),
    hipWidth: 1 / Math.sqrt(ratio),
  }
}

const scaleVec = (v: Vec3, k: Vec3): Vec3 => [v[0] * k[0], v[1] * k[1], v[2] * k[2]]

export function computeRig(sliders: BodySliders): Rig {
  const f = rigFactors(sliders)
  const L = f.length
  const rig = {} as Rig
  for (const b of SKELETON) {
    // Bone offsets scale with height; shoulder/hip spread also scales with the width factors.
    let offK: Vec3 = [L, L, L]
    if (SHOULDER_WIDTH_BONES.has(b.name)) offK = [L * f.shoulderWidth, L, L]
    if (HIP_WIDTH_BONES.has(b.name)) offK = [L * f.hipWidth, L, L]

    const limbThickness = b.cls === 'arm' || b.cls === 'leg' || b.cls === 'chest' ? f.muscle : 1
    const thickness = b.cls === 'head' || b.cls === 'extremity' ? 1 : f.girth * limbThickness

    let segment: Segment
    const s = b.segment
    if (s.shape === 'capsule') {
      const lenK = SHOULDER_SEGMENT_BONES.has(b.name) ? L * f.shoulderWidth : L
      segment = { shape: 'capsule', dir: [...s.dir], length: s.length * lenK, radius: s.radius * L * thickness }
    } else if (s.shape === 'box') {
      let widthK = thickness
      if (b.name === 'chest') widthK *= f.shoulderWidth
      if (b.name === 'hips') widthK *= f.hipWidth
      segment = {
        shape: 'box',
        size: scaleVec(s.size, [L * widthK, L, L * thickness]),
        center: scaleVec(s.center, [L, L, L]),
      }
    } else {
      segment = { shape: 'sphere', radius: s.radius * L, center: scaleVec(s.center, [L, L, L]) }
    }

    rig[b.name] = { offset: scaleVec(b.offset, offK), segment, jointRadius: b.jointRadius * L * Math.sqrt(thickness) }
  }
  return rig
}
