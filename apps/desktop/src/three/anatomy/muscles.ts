// Anatomy look: the table of body masses and its fit to the current body. Pure (no Three.js) so it stays unit-testable;
// anatomyLayer.ts turns each placement into a mesh under its bone.
//
// Every form is a "spindle": a lathe solid along its local Y, from -0.5 to 0.5, scaled to `size`, then rotated
// (XYZ Euler) and moved to `center` in its bone's local frame. Forms are authored for the left side at the rest
// body (neutral sliders, 1.75 m); the right side is mirrored. Bone frames have no rest rotation, so at rest the
// local axes are the world axes: +Y up, +X the character's left, +Z the front.
import { computeRig, type Rig, type Segment } from '../bodyRig'
import { NEUTRAL_SLIDERS } from '../../state/bodySliders'
import type { JointName, Vec3 } from '../../types/scene'

/** Colour per body mass, after Tram's simplified study figure: big matte blocks, one colour per region. */
export const MUSCLE_COLORS = {
  head: 0xcdb94f,
  torso: 0x7f9bd6,
  abdomen: 0x8cc44a,
  deltoid: 0xdc6d38,
  biceps: 0x8cc44a,
  triceps: 0xb47ad8,
  forearm: 0xd9706e,
  hand: 0xd5c25a,
  thigh: 0xd05e3a,
  shin: 0xb592cf,
} as const
export type MuscleColor = keyof typeof MUSCLE_COLORS

export interface SpindleProfile {
  /** Where the widest point sits along the form, 0 = the -Y end, 1 = the +Y end. */
  peak: number
  /** End shape: 0.5 is close to an ellipsoid, 1 is lemon-pointed, lower is boxier. */
  ends: number
}

export interface MuscleDef {
  id: string
  bone: Base
  color: MuscleColor
  center: Vec3
  size: Vec3
  rot?: Vec3
  profile?: Partial<SpindleProfile>
  /** Paired forms are authored on the left and mirrored to the right. Default true for side bones. */
  mirror?: boolean
}

export interface MusclePlacement {
  id: string
  bone: JointName
  color: MuscleColor
  center: Vec3
  size: Vec3
  rot: Vec3
  profile: SpindleProfile
}

export const DEFAULT_PROFILE: SpindleProfile = { peak: 0.5, ends: 0.55 }

/** Bones without a side suffix; side bones get L/R appended. */
type Base =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulder'
  | 'upperArm'
  | 'forearm'
  | 'hand'
  | 'thigh'
  | 'shin'
  | 'foot'
  | 'toe'

const CENTRAL: ReadonlySet<Base> = new Set(['hips', 'spine', 'chest', 'neck', 'head'])

const HALF_PI = Math.PI / 2
/** Points a spindle's long axis along +Z (feet, toes). */
const ALONG_Z: Vec3 = [HALF_PI, 0, 0]
/** Bulge toward the upper end, like most limb masses. */
const HIGH: Partial<SpindleProfile> = { peak: 0.65 }
/** Fuller, flatter-ended masses (torso shells). */
const SHELL: Partial<SpindleProfile> = { ends: 0.42 }
/** Joint fillers: round forms that close the gap where two bones meet. */
const BALL: Partial<SpindleProfile> = { ends: 0.5 }

// prettier-ignore
export const MUSCLES: readonly MuscleDef[] = [
  // ---- Pelvis (hips node: thigh joints sit 5 cm below, 9 cm out). Wide at the top, tapering to the crotch. ----
  { id: 'pelvis', bone: 'hips', color: 'torso', center: [0, -0.045, 0], size: [0.3, 0.25, 0.2], profile: { peak: 0.7, ends: 0.45 } },
  { id: 'glute', bone: 'hips', color: 'torso', center: [0.05, -0.065, -0.03], size: [0.14, 0.19, 0.12], mirror: true },

  // ---- Waist (spine node to chest node: 18 cm) ----
  { id: 'waist', bone: 'spine', color: 'torso', center: [0, 0.08, -0.004], size: [0.23, 0.28, 0.18], profile: SHELL },
  { id: 'abdomen', bone: 'spine', color: 'abdomen', center: [0, 0.08, 0.04], size: [0.2, 0.26, 0.1], profile: { ends: 0.25 } },

  // ---- Ribcage and back (chest node: box spans y 0..0.27, shoulder joints at y 0.22, x ±0.18) ----
  { id: 'ribcage', bone: 'chest', color: 'torso', center: [0, 0.15, 0], size: [0.36, 0.38, 0.23], profile: { peak: 0.75, ends: 0.42 } },
  { id: 'trap', bone: 'chest', color: 'torso', center: [0.06, 0.255, -0.02], size: [0.14, 0.09, 0.1], rot: [0, 0, -0.4], mirror: true },

  // ---- Neck and head (head node: sphere centre 7.5 cm up, radius 11.5 cm) ----
  { id: 'neck', bone: 'neck', color: 'head', center: [0, 0.035, 0], size: [0.1, 0.15, 0.1] },
  { id: 'skull', bone: 'head', color: 'head', center: [0, 0.09, -0.005], size: [0.185, 0.24, 0.215], profile: { peak: 0.62, ends: 0.5 } },
  { id: 'jaw', bone: 'head', color: 'head', center: [0, 0.04, 0.012], size: [0.13, 0.14, 0.16], profile: { peak: 0.65, ends: 0.5 } },

  // ---- Upper arm (29 cm down, radius 4.5 cm) ----
  { id: 'deltoid', bone: 'upperArm', color: 'deltoid', center: [0.012, -0.05, 0], size: [0.135, 0.2, 0.14], profile: HIGH },
  { id: 'biceps', bone: 'upperArm', color: 'biceps', center: [0, -0.16, 0.016], size: [0.088, 0.25, 0.085], profile: { peak: 0.55, ends: 0.5 } },
  { id: 'triceps', bone: 'upperArm', color: 'triceps', center: [0, -0.145, -0.02], size: [0.092, 0.27, 0.088], profile: HIGH },

  // ---- Forearm (26 cm down, radius 3.8 cm) ----
  { id: 'elbow', bone: 'forearm', color: 'forearm', center: [0, -0.005, -0.004], size: [0.06, 0.07, 0.06], profile: BALL },
  { id: 'forearm', bone: 'forearm', color: 'forearm', center: [0, -0.125, 0], size: [0.098, 0.29, 0.088], profile: { peak: 0.75, ends: 0.5 } },
  { id: 'wrist', bone: 'hand', color: 'hand', center: [0, -0.005, 0], size: [0.035, 0.05, 0.06], profile: BALL },

  // ---- Thigh (44 cm down, radius 7.5 cm): one long mass, fullest toward the hip ----
  { id: 'thigh', bone: 'thigh', color: 'thigh', center: [0, -0.205, 0.004], size: [0.175, 0.48, 0.17], profile: { peak: 0.7, ends: 0.5 } },

  // ---- Shin (39 cm down, radius 5.5 cm) ----
  { id: 'knee', bone: 'shin', color: 'forearm', center: [0, -0.01, 0.004], size: [0.085, 0.09, 0.085], profile: BALL },
  { id: 'shin', bone: 'shin', color: 'shin', center: [0, -0.2, 0], size: [0.08, 0.41, 0.085], profile: { peak: 0.6, ends: 0.5 } },
  { id: 'calf', bone: 'shin', color: 'shin', center: [0, -0.12, -0.024], size: [0.1, 0.23, 0.1], profile: { peak: 0.68, ends: 0.5 } },

  // ---- Foot and toes ----
  { id: 'ankle', bone: 'foot', color: 'hand', center: [0, 0.005, -0.004], size: [0.06, 0.09, 0.065], profile: BALL },
  { id: 'foot', bone: 'foot', color: 'hand', center: [0, -0.035, 0.04], size: [0.085, 0.2, 0.065], rot: ALONG_Z, profile: { peak: 0.4, ends: 0.45 } },
  { id: 'toes', bone: 'toe', color: 'hand', center: [0, 0, 0.025], size: [0.085, 0.06, 0.04], rot: ALONG_Z, profile: SHELL },
]

/** Per-axis scale of a bone's segment relative to the rest body, so forms follow length and girth sliders. */
function segmentScale(seg: Segment, rest: Segment, length: number, restLength: number): Vec3 {
  const lk = restLength > 0 ? length / restLength : 1
  switch (seg.shape) {
    case 'box': {
      const r = rest.shape === 'box' ? rest.size : seg.size
      return [seg.size[0] / r[0], seg.size[1] / r[1], seg.size[2] / r[2]]
    }
    case 'sphere': {
      const k = rest.shape === 'sphere' ? seg.radius / rest.radius : 1
      return [k, k, k]
    }
    case 'capsule': {
      const k = rest.shape === 'capsule' ? seg.radius / rest.radius : 1
      // Capsules along X (collarbone) stretch in X; the rest run along Y.
      return Math.abs(seg.dir[0]) > 0.5 ? [lk, k, k] : [k, lk, k]
    }
  }
}

/** Length of a bone: the distance to the joint it drives (its first child), or its capsule length. */
function boneLength(rig: Rig, bone: JointName): number {
  const seg = rig[bone].segment
  if (seg.shape === 'capsule') return seg.length
  return 0
}

let restRig: Rig | null = null
const rest = (): Rig => (restRig ??= computeRig(NEUTRAL_SLIDERS))

export function boneScale(rig: Rig, bone: JointName): Vec3 {
  const r = rest()
  // The spine and chest forms fill the gap to the next node, so their height follows the bone offsets.
  if (bone === 'spine') {
    const k = rig.spine.segment.shape === 'capsule' && r.spine.segment.shape === 'capsule' ? rig.spine.segment.radius / r.spine.segment.radius : 1
    return [k, rig.chest.offset[1] / r.chest.offset[1], k]
  }
  return segmentScale(rig[bone].segment, r[bone].segment, boneLength(rig, bone), boneLength(r, bone))
}

const mul3 = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
const mirrorX = (v: Vec3): Vec3 => [-v[0], v[1], v[2]]
/** Mirroring across X keeps the X rotation and flips Y and Z. */
const mirrorRot = (r: Vec3): Vec3 => [r[0], -r[1], -r[2]]

/** All muscle forms for a body, in their bones' local frames. */
export function placeMuscles(rig: Rig): MusclePlacement[] {
  const out: MusclePlacement[] = []
  for (const m of MUSCLES) {
    const profile = { ...DEFAULT_PROFILE, ...m.profile }
    const rot = m.rot ?? [0, 0, 0]
    if (CENTRAL.has(m.bone)) {
      const bone = m.bone as JointName
      const k = boneScale(rig, bone)
      const center = mul3(m.center, k)
      const size = mul3(m.size, k)
      if (!m.mirror) {
        out.push({ id: m.id, bone, color: m.color, center, size, rot, profile })
        continue
      }
      out.push({ id: `${m.id}L`, bone, color: m.color, center, size, rot, profile })
      out.push({ id: `${m.id}R`, bone, color: m.color, center: mirrorX(center), size, rot: mirrorRot(rot), profile })
      continue
    }
    for (const side of ['L', 'R'] as const) {
      const bone = `${m.bone}${side}` as JointName
      const k = boneScale(rig, bone)
      const center = mul3(m.center, k)
      out.push({
        id: `${m.id}${side}`,
        bone,
        color: m.color,
        center: side === 'L' ? center : mirrorX(center),
        size: mul3(m.size, k),
        rot: side === 'L' ? rot : mirrorRot(rot),
        profile,
      })
    }
  }
  return out
}

/**
 * Radius of the unit spindle at height t (0 = -Y end, 1 = +Y end). The widest point is 0.5 at `peak`;
 * `ends` shapes the taper (sin^ends), so 0.5 is close to an ellipse.
 */
export function spindleRadius(t: number, p: SpindleProfile): number {
  const c = Math.min(Math.max(t, 0), 1)
  const u = c < p.peak ? (0.5 * c) / p.peak : 0.5 + (0.5 * (c - p.peak)) / (1 - p.peak)
  return 0.5 * Math.pow(Math.max(Math.sin(Math.PI * u), 0), p.ends)
}
