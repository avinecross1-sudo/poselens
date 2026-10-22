// Pure mapping from body sliders (+ asymmetry) to bone offsets and segment sizes.
// No Three.js imports so it stays unit-testable; mannequin.ts applies the result.
//
// Proportion sliders (head, torso, legs, arms, neck, feet) change segment lengths relative to each
// other; the whole figure is then rescaled so the standing height always equals the height slider.
import { asymmetryValue, NEUTRAL_SLIDERS } from '../state/bodySliders'
import type { BodySliders, JointName, Vec3 } from '../types/scene'

/** Rest skeleton is authored for this height (CLAUDE.md default). */
export const REFERENCE_HEIGHT_M = 1.75
/** Reference slider values = "Realistic Average" preset; rest geometry is authored at these. */
export const REFERENCE_MASS = NEUTRAL_SLIDERS.mass
export const REFERENCE_MUSCLE = NEUTRAL_SLIDERS.muscle
export const REFERENCE_SOFTNESS = NEUTRAL_SLIDERS.softness
export const REFERENCE_SHOULDER_HIP_RATIO = NEUTRAL_SLIDERS.shoulderHipRatio

/** Girth change per unit of mass slider (1.0 mass ≈ +45% radius vs reference). */
export const MASS_GIRTH_GAIN = 0.9
/** Girth change per unit of softness slider; softness adds less width than mass. */
export const SOFTNESS_GIRTH_GAIN = 0.35
/** Extra limb and chest thickness per unit of muscle slider. */
export const MUSCLE_LIMB_GAIN = 0.5
/** Girth never shrinks below this fraction of reference, so slim presets stay solid. */
export const MIN_GIRTH = 0.6

// ---- Rest dimensions at 1.75 m (meters). Character faces +Z; character's left is +X; feet on y = 0. ----
/** Hip joints sit this far below the hips node. */
const HIP_DROP = 0.05
const HIP_HALF_WIDTH = 0.09
const THIGH = 0.44
const SHIN = 0.39
/** Ankle joint height = foot box height (sole on the ground). */
const FOOT_HEIGHT = 0.07
const FOOT_LENGTH = 0.17
const FOOT_WIDTH = 0.09
/** Foot box centre sits forward of the ankle (heel behind, toes in front). */
const FOOT_FORWARD = 0.045
const TOE_JOINT: Vec3 = [0, -0.045, 0.13]
const TOE_SIZE: Vec3 = [0.09, 0.05, 0.06]
const SPINE = 0.1
const CHEST = 0.18
const NECK_BASE = 0.27
const NECK = 0.06
/** Head sphere: chin = centre - radius, crown = centre + radius. One head unit = 2 x radius. */
const HEAD_CENTER = 0.075
const HEAD_RADIUS = 0.115
const SHOULDER_HEIGHT = 0.22
const SHOULDER_INSET = 0.03
const CLAVICLE = 0.15
const UPPER_ARM = 0.29
const FOREARM = 0.26
/** Palm box; fingers are visual primitives in mannequin.ts sized from the palm. */
const PALM: Vec3 = [0.035, 0.1, 0.09]
/** Hand length (wrist to fingertip) = palm length x this. */
export const HAND_LENGTH_PER_PALM = 1.8

const HIPS_BOX: Vec3 = [0.3, 0.18, 0.18]
const HIPS_BOX_DROP = 0.02
const CHEST_BOX: Vec3 = [0.34, 0.28, 0.2]
const CHEST_BOX_CENTER = 0.13
const SPINE_RADIUS = 0.11
const NECK_RADIUS = 0.045
const CLAVICLE_RADIUS = 0.045
const UPPER_ARM_RADIUS = 0.045
const FOREARM_RADIUS = 0.038
const THIGH_RADIUS = 0.075
const SHIN_RADIUS = 0.055

export type BodyClass = 'torso' | 'chest' | 'arm' | 'leg' | 'head' | 'extremity'

export type Segment =
  | { shape: 'capsule'; dir: Vec3; length: number; radius: number }
  | { shape: 'box'; size: Vec3; center: Vec3 }
  | { shape: 'sphere'; radius: number; center: Vec3 }

export interface BoneDef {
  name: JointName
  parent: JointName | 'root'
  /** Rest joint-marker radius at 1.75 m. */
  jointRadius: number
  cls: BodyClass
}

export interface RigBone {
  /** Offset from parent node, meters. */
  offset: Vec3
  segment: Segment
  jointRadius: number
}

export type Rig = Record<JointName, RigBone>

function sideDefs(s: 'L' | 'R'): BoneDef[] {
  const n = <T extends string>(base: T) => `${base}${s}` as JointName
  return [
    { name: n('shoulder'), parent: 'chest', jointRadius: 0.04, cls: 'torso' },
    { name: n('upperArm'), parent: n('shoulder'), jointRadius: 0.05, cls: 'arm' },
    { name: n('forearm'), parent: n('upperArm'), jointRadius: 0.042, cls: 'arm' },
    { name: n('hand'), parent: n('forearm'), jointRadius: 0.032, cls: 'extremity' },
    { name: n('thigh'), parent: 'hips', jointRadius: 0.08, cls: 'leg' },
    { name: n('shin'), parent: n('thigh'), jointRadius: 0.06, cls: 'leg' },
    { name: n('foot'), parent: n('shin'), jointRadius: 0.045, cls: 'extremity' },
    { name: n('toe'), parent: n('foot'), jointRadius: 0.025, cls: 'extremity' },
  ]
}

/** Hierarchy in parent-first order (CLAUDE.md). */
export const SKELETON: readonly BoneDef[] = [
  { name: 'hips', parent: 'root', jointRadius: 0.06, cls: 'torso' },
  { name: 'spine', parent: 'hips', jointRadius: 0.05, cls: 'torso' },
  { name: 'chest', parent: 'spine', jointRadius: 0.05, cls: 'chest' },
  { name: 'neck', parent: 'chest', jointRadius: 0.04, cls: 'torso' },
  { name: 'head', parent: 'neck', jointRadius: 0.035, cls: 'head' },
  ...sideDefs('L'),
  ...sideDefs('R'),
]

export const PARENT: Record<JointName, JointName | 'root'> = Object.fromEntries(SKELETON.map((b) => [b.name, b.parent])) as Record<
  JointName,
  JointName | 'root'
>

export interface RigFactors {
  /** Scale that makes the standing height equal the height slider. */
  length: number
  girth: number
  muscle: number
  shoulderWidth: number
  hipWidth: number
}

/** Unnormalised proportional lengths (before the height rescale). */
interface Proportions {
  thigh: number
  shin: number
  footScale: number
  spine: number
  chest: number
  neckBase: number
  neck: number
  headCenter: number
  headRadius: number
  upperArm: number
  forearm: number
  hipsY: number
  standing: number
}

function proportions(s: BodySliders): Proportions {
  // Ratio sliders move length between the two segments while keeping the limb total.
  const legK = (s.legLength * (THIGH + SHIN)) / (THIGH + SHIN * s.shinRatio)
  const armK = (s.armLength * (UPPER_ARM + FOREARM)) / (UPPER_ARM + FOREARM * s.forearmRatio)
  const thigh = THIGH * legK
  const shin = SHIN * s.shinRatio * legK
  const footScale = s.footSize
  const hipsY = HIP_DROP + thigh + shin + FOOT_HEIGHT * footScale
  const spine = SPINE * s.torsoLength
  const chest = CHEST * s.torsoLength
  const neckBase = NECK_BASE * s.torsoLength
  const neck = NECK * s.neckLength
  const headCenter = HEAD_CENTER * s.headScale
  const headRadius = HEAD_RADIUS * s.headScale
  return {
    thigh,
    shin,
    footScale,
    spine,
    chest,
    neckBase,
    neck,
    headCenter,
    headRadius,
    upperArm: UPPER_ARM * armK,
    forearm: FOREARM * s.forearmRatio * armK,
    hipsY,
    standing: hipsY + spine + chest + neckBase + neck + headCenter + headRadius,
  }
}

export function rigFactors(s: BodySliders): RigFactors {
  const girth = Math.max(
    MIN_GIRTH,
    1 + MASS_GIRTH_GAIN * (s.mass - REFERENCE_MASS) + SOFTNESS_GIRTH_GAIN * (s.softness - REFERENCE_SOFTNESS),
  )
  const ratio = s.shoulderHipRatio / REFERENCE_SHOULDER_HIP_RATIO
  return {
    length: s.height / proportions(s).standing,
    girth,
    muscle: Math.max(MIN_GIRTH, 1 + MUSCLE_LIMB_GAIN * (s.muscle - REFERENCE_MUSCLE)),
    // Split the ratio evenly between shoulders (wider) and hips (narrower).
    shoulderWidth: Math.sqrt(ratio),
    hipWidth: 1 / Math.sqrt(ratio),
  }
}

const mul = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]
const capsule = (dir: Vec3, length: number, radius: number): Segment => ({ shape: 'capsule', dir, length, radius })
const box = (size: Vec3, center: Vec3): Segment => ({ shape: 'box', size, center })

export function computeRig(sliders: BodySliders, asymmetry: Record<string, number> = {}): Rig {
  const s = sliders
  const p = proportions(s)
  const f = rigFactors(s)
  const L = f.length
  const torsoT = f.girth
  const limbT = f.girth * f.muscle * s.limbThickness
  const marker = (b: BoneDef, thickness: number): number => b.jointRadius * L * Math.sqrt(thickness) * s.jointSize
  const def = (name: JointName): BoneDef => SKELETON.find((b) => b.name === name) as BoneDef
  const rig = {} as Rig

  rig.hips = {
    offset: [0, p.hipsY * L, 0],
    segment: box([HIPS_BOX[0] * L * torsoT * f.hipWidth, HIPS_BOX[1] * L, HIPS_BOX[2] * L * torsoT * s.hipDepth], [0, -HIPS_BOX_DROP * L, 0]),
    jointRadius: marker(def('hips'), torsoT),
  }
  rig.spine = {
    offset: [0, p.spine * L, 0],
    segment: capsule([0, 1, 0], p.chest * L, SPINE_RADIUS * L * torsoT * s.waist),
    jointRadius: marker(def('spine'), torsoT),
  }
  const chestT = f.girth * f.muscle
  rig.chest = {
    offset: [0, p.chest * L, 0],
    segment: box(
      [CHEST_BOX[0] * L * chestT * f.shoulderWidth, CHEST_BOX[1] * s.torsoLength * L, CHEST_BOX[2] * L * chestT * s.chestDepth],
      [0, CHEST_BOX_CENTER * s.torsoLength * L, 0],
    ),
    jointRadius: marker(def('chest'), chestT),
  }
  rig.neck = {
    offset: [0, p.neckBase * L, 0],
    segment: capsule([0, 1, 0], p.neck * L, NECK_RADIUS * L * torsoT * s.neckThickness),
    jointRadius: marker(def('neck'), torsoT),
  }
  rig.head = {
    offset: [0, p.neck * L, 0],
    segment: { shape: 'sphere', radius: p.headRadius * L, center: [0, p.headCenter * L, 0] },
    jointRadius: marker(def('head'), 1),
  }

  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1
    const word = side === 'L' ? 'left' : 'right'
    const n = <T extends string>(base: T) => `${base}${side}` as JointName
    const armT = limbT * asymmetryValue(asymmetry, `${word}ArmThickness`)
    const legT = limbT * asymmetryValue(asymmetry, `${word}LegThickness`)
    const shoulderY = SHOULDER_HEIGHT * s.torsoLength + s.shoulderSlope + asymmetryValue(asymmetry, `${word}ShoulderHeight`)
    const hipY = -HIP_DROP + asymmetryValue(asymmetry, `${word}HipHeight`)
    const fk = p.footScale * L

    rig[n('shoulder')] = {
      offset: [SHOULDER_INSET * sign * L, shoulderY * L, 0],
      segment: capsule([sign, 0, 0], CLAVICLE * L * f.shoulderWidth, CLAVICLE_RADIUS * L * torsoT),
      jointRadius: marker(def(n('shoulder')), torsoT),
    }
    rig[n('upperArm')] = {
      offset: [CLAVICLE * sign * L * f.shoulderWidth, 0, 0],
      segment: capsule([0, -1, 0], p.upperArm * L, UPPER_ARM_RADIUS * L * armT),
      jointRadius: marker(def(n('upperArm')), armT),
    }
    rig[n('forearm')] = {
      offset: [0, -p.upperArm * L, 0],
      segment: capsule([0, -1, 0], p.forearm * L, FOREARM_RADIUS * L * armT),
      jointRadius: marker(def(n('forearm')), armT),
    }
    const hk = s.handSize * L
    rig[n('hand')] = {
      offset: [0, -p.forearm * L, 0],
      segment: box(mul(PALM, hk), [0, (-PALM[1] / 2) * hk, 0]),
      jointRadius: marker(def(n('hand')), 1),
    }
    rig[n('thigh')] = {
      offset: [HIP_HALF_WIDTH * sign * L * f.hipWidth, hipY * L, 0],
      segment: capsule([0, -1, 0], p.thigh * L, THIGH_RADIUS * L * legT),
      jointRadius: marker(def(n('thigh')), legT),
    }
    rig[n('shin')] = {
      offset: [0, -p.thigh * L, 0],
      segment: capsule([0, -1, 0], p.shin * L, SHIN_RADIUS * L * legT),
      jointRadius: marker(def(n('shin')), legT),
    }
    rig[n('foot')] = {
      offset: [0, -p.shin * L, 0],
      segment: box([FOOT_WIDTH * fk, FOOT_HEIGHT * fk, FOOT_LENGTH * fk], [0, (-FOOT_HEIGHT / 2) * fk, FOOT_FORWARD * fk]),
      jointRadius: marker(def(n('foot')), 1),
    }
    rig[n('toe')] = {
      offset: mul(TOE_JOINT, fk),
      segment: box(mul(TOE_SIZE, fk), [0, 0, (TOE_SIZE[2] / 2) * fk]),
      jointRadius: marker(def(n('toe')), 1),
    }
  }
  return rig
}

/** Rest offsets at neutral sliders (the authored skeleton). */
export const REST_OFFSETS: Record<JointName, Vec3> = Object.fromEntries(
  Object.entries(computeRig(NEUTRAL_SLIDERS)).map(([k, b]) => [k, b.offset]),
) as Record<JointName, Vec3>
