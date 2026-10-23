// Ground contact, support polygon and centre of mass (docs/balance-spec.md). Pure: rig + pose in, numbers out.
// Ground-plane points are [x, z] in world meters.
import { Vector3, type Matrix4 } from 'three'
import { forwardKinematics, type WorldPose } from '../solve/fk'
import { GROUND_CONTACT_M } from '../solve/retarget'
import type { Rig, Segment } from '../three/bodyRig'
import { radToDeg } from './units'
import type { BodySliders, JointName, PoseState, Side, Vec2, Vec3 } from '../types/scene'

/** balance-spec: CoM further than this outside the support polygon raises a warning. */
export const COM_OUTSIDE_TOLERANCE_M = 0.02
/** balance-spec: a planted foot moving more than this between frames is sliding. */
export const FOOT_SLIDE_M = 0.001

// ---- Segment mass ratios (balance-spec "Default segment mass ratios", Dempster via Winter) ----

/** Massed segments: the node whose segment carries the mass. Head includes the neck; shoulders have none. */
export const MASS_SEGMENTS = [
  'head',
  'chest',
  'spine',
  'hips',
  'upperArmL',
  'upperArmR',
  'forearmL',
  'forearmR',
  'handL',
  'handR',
  'thighL',
  'thighR',
  'shinL',
  'shinR',
  'footL',
  'footR',
] as const satisfies readonly JointName[]
export type MassSegment = (typeof MASS_SEGMENTS)[number]

export const DEFAULT_MASS_RATIOS: Record<MassSegment, number> = {
  head: 0.081,
  chest: 0.216,
  spine: 0.139,
  hips: 0.142,
  upperArmL: 0.028,
  upperArmR: 0.028,
  forearmL: 0.016,
  forearmR: 0.016,
  handL: 0.006,
  handR: 0.006,
  thighL: 0.1,
  thighR: 0.1,
  shinL: 0.0465,
  shinR: 0.0465,
  footL: 0.0145,
  footR: 0.0145,
}

/** balance-spec "Preset adjustment": mass at or below this leaves the ratios unchanged. */
export const MASS_NEUTRAL = 0.5
/** balance-spec: hips and spine gain up to this fraction at mass 1. */
export const MAX_TORSO_BOOST = 0.25
/** The foot's mass sits mostly in the foot box; this share goes to the toe box. */
const TOE_MASS_SHARE = 0.2

/** Ratios for a body, renormalized to sum to 1. Recomputed from the sliders, so CoM follows them. */
export function massRatios(sliders: Pick<BodySliders, 'mass' | 'headScale'>): Record<MassSegment, number> {
  const torsoBoost = (MAX_TORSO_BOOST * Math.max(0, sliders.mass - MASS_NEUTRAL)) / (1 - MASS_NEUTRAL)
  const raw = { ...DEFAULT_MASS_RATIOS }
  raw.hips *= 1 + torsoBoost
  raw.spine *= 1 + torsoBoost
  // Mass follows volume.
  raw.head *= sliders.headScale ** 3
  const total = MASS_SEGMENTS.reduce((t, k) => t + raw[k], 0)
  for (const k of MASS_SEGMENTS) raw[k] /= total
  return raw
}

/** Segment centre in its node's local frame. */
export function segmentCentroid(seg: Segment): Vector3 {
  if (seg.shape === 'capsule') return new Vector3(...seg.dir).normalize().multiplyScalar(seg.length / 2)
  return new Vector3(...seg.center)
}

const worldPoint = (world: WorldPose, j: JointName, local: Vector3): Vector3 => local.clone().applyMatrix4(world[j])

export function centerOfMass(rig: Rig, world: WorldPose, ratios: Record<MassSegment, number>): Vector3 {
  const com = new Vector3()
  for (const k of MASS_SEGMENTS) {
    const r = ratios[k]
    if (k === 'footL' || k === 'footR') {
      const toe: JointName = k === 'footL' ? 'toeL' : 'toeR'
      com.addScaledVector(worldPoint(world, k, segmentCentroid(rig[k].segment)), r * (1 - TOE_MASS_SHARE))
      com.addScaledVector(worldPoint(world, toe, segmentCentroid(rig[toe].segment)), r * TOE_MASS_SHARE)
    } else {
      com.addScaledVector(worldPoint(world, k, segmentCentroid(rig[k].segment)), r)
    }
  }
  return com
}

// ---- Foot contact ----

export type ContactPart = 'heel' | 'ball' | 'toe'
export type FootState = 'planted' | 'edge' | 'floating'

export interface ContactPoint {
  side: Side
  part: ContactPart
  /** Ground point [x, z]. */
  at: Vec2
  /** Height above the ground (m); negative = below. */
  height: number
}

/** Inner and outer sole corners of heel, ball and toe tip, in world space. */
export function footSamples(rig: Rig, world: WorldPose, side: Side): { part: ContactPart; p: Vector3 }[] {
  const foot = rig[`foot${side}`].segment
  const toe = rig[`toe${side}`].segment
  if (foot.shape !== 'box' || toe.shape !== 'box') return []
  const out: { part: ContactPart; p: Vector3 }[] = []
  const sole = (seg: Extract<Segment, { shape: 'box' }>, z: number) =>
    [-0.5, 0.5].map((x) => new Vector3(seg.center[0] + x * seg.size[0], seg.center[1] - seg.size[1] / 2, z))
  for (const p of sole(foot, foot.center[2] - foot.size[2] / 2)) out.push({ part: 'heel', p: worldPoint(world, `foot${side}`, p) })
  // The ball sits at the back edge of the toe box, so a bent toe lifts the tip but keeps the ball down.
  for (const p of sole(toe, toe.center[2] - toe.size[2] / 2)) out.push({ part: 'ball', p: worldPoint(world, `toe${side}`, p) })
  for (const p of sole(toe, toe.center[2] + toe.size[2] / 2)) out.push({ part: 'toe', p: worldPoint(world, `toe${side}`, p) })
  return out
}

/** balance-spec: >= 2 of heel / ball / toe touching = planted, 1 = edge, 0 = floating. */
export function footState(contacts: readonly ContactPoint[], side: Side): FootState {
  const parts = new Set(contacts.filter((c) => c.side === side).map((c) => c.part))
  return parts.size >= 2 ? 'planted' : parts.size === 1 ? 'edge' : 'floating'
}

// ---- Ground-plane geometry ----

const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Convex hull (Andrew's monotone chain), counter-clockwise in (x, z), no repeated end point. */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const unique = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]?.[0] || p[1] !== pts[i - 1]?.[1])
  if (unique.length <= 2) return unique
  const build = (list: Vec2[]): Vec2[] => {
    const h: Vec2[] = []
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2] as Vec2, h[h.length - 1] as Vec2, p) <= 0) h.pop()
      h.push(p)
    }
    return h
  }
  const lower = build(unique)
  const upper = build([...unique].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len2 = dx * dx + dz * dz
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2))
  return [a[0] + t * dx, a[1] + t * dz]
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1])

/** True when p is inside (or on) a convex hull from convexHull(). Points and segments contain only what lies on them. */
export function insideHull(hull: readonly Vec2[], p: Vec2): boolean {
  if (hull.length < 3) return hull.length > 0 && distanceToHull(hull, p) === 0
  for (let i = 0; i < hull.length; i++) {
    if (cross(hull[i] as Vec2, hull[(i + 1) % hull.length] as Vec2, p) < 0) return false
  }
  return true
}

/** Closest point of the hull (boundary or inside) to p. */
export function closestOnHull(hull: readonly Vec2[], p: Vec2): Vec2 | null {
  if (hull.length === 0) return null
  if (hull.length === 1) return [...(hull[0] as Vec2)]
  if (hull.length >= 3 && insideHull(hull, p)) return [...p]
  let best: Vec2 | null = null
  const n = hull.length === 2 ? 1 : hull.length
  for (let i = 0; i < n; i++) {
    const q = closestOnSegment(p, hull[i] as Vec2, hull[(i + 1) % hull.length] as Vec2)
    if (!best || dist(p, q) < dist(p, best)) best = q
  }
  return best
}

/** 0 inside; otherwise meters to the hull. Infinity for an empty hull. */
export function distanceToHull(hull: readonly Vec2[], p: Vec2): number {
  const q = closestOnHull(hull, p)
  return q ? dist(p, q) : Infinity
}

/** Area centroid of a convex polygon; the mean point for fewer than 3 points. */
export function hullCentroid(hull: readonly Vec2[]): Vec2 | null {
  if (hull.length === 0) return null
  if (hull.length < 3) return [hull.reduce((t, p) => t + p[0], 0) / hull.length, hull.reduce((t, p) => t + p[1], 0) / hull.length]
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i] as Vec2
    const q = hull[(i + 1) % hull.length] as Vec2
    const c = p[0] * q[1] - q[0] * p[1]
    a += c
    cx += (p[0] + q[0]) * c
    cz += (p[1] + q[1]) * c
  }
  if (Math.abs(a) < 1e-12) return hullCentroid(hull.slice(0, 2))
  return [cx / (3 * a), cz / (3 * a)]
}

// ---- Full balance ----

export interface BalanceResult {
  com: Vec3
  /** CoM dropped onto the ground [x, z]. */
  comGround: Vec2
  contacts: ContactPoint[]
  feet: Record<Side, FootState>
  supportPolygon: Vec2[]
  /** Meters outside the support polygon (0 inside, Infinity without contact). */
  outsideBy: number
  /** Closest point of the support polygon to the CoM (the weight-shift target), null without contact. */
  shiftTarget: Vec2 | null
  /** Arrow from the CoM's ground point to the polygon centroid (balance-spec lean indicator). */
  lean: { from: Vec2; to: Vec2; length: number; angle: number } | null
  /** Share of the weight on each foot (sums to 1), null without contact. */
  weight: Record<Side, number> | null
  warnings: string[]
}

export interface BalanceInput {
  rig: Rig
  pose: PoseState
  sliders: Pick<BodySliders, 'mass' | 'headScale'>
  stylize?: Matrix4 | null
  /** The previous result, during a live drag: planted feet that moved since then are sliding. */
  previous?: BalanceResult | null
}

export const NO_CONTACT_WARNING = 'No ground contact'
export const OUTSIDE_WARNING = 'CoM outside support polygon'
const CM_PER_M = 100

/** Shown in the viewport even with the balance overlay off: they are about the pose, not about a jump. */
export const alwaysShownBalanceWarning = (w: string): boolean => w.startsWith(OUTSIDE_WARNING) || w.endsWith('sliding')
const SIDE_LABEL: Record<Side, string> = { L: 'Left', R: 'Right' }

const contactCentroid = (contacts: readonly ContactPoint[], side: Side): Vec2 | null => {
  const own = contacts.filter((c) => c.side === side)
  if (!own.length) return null
  return [own.reduce((t, c) => t + c.at[0], 0) / own.length, own.reduce((t, c) => t + c.at[1], 0) / own.length]
}

/** Weight per foot: the CoM's position along the line between the feet's contact centres. */
export function weightShare(contacts: readonly ContactPoint[], comGround: Vec2): Record<Side, number> | null {
  const l = contactCentroid(contacts, 'L')
  const r = contactCentroid(contacts, 'R')
  if (!l && !r) return null
  if (!l) return { L: 0, R: 1 }
  if (!r) return { L: 1, R: 0 }
  const q = closestOnSegment(comGround, l, r)
  const span = dist(l, r)
  const t = span === 0 ? 0.5 : dist(l, q) / span
  return { L: 1 - t, R: t }
}

export function computeBalance(input: BalanceInput): BalanceResult {
  const { rig, pose } = input
  const world = forwardKinematics(rig, pose.joints, pose.rootTransform, input.stylize ?? null)
  const comV = centerOfMass(rig, world, massRatios(input.sliders))
  const com: Vec3 = [comV.x, comV.y, comV.z]
  const comGround: Vec2 = [comV.x, comV.z]

  const contacts: ContactPoint[] = []
  for (const side of ['L', 'R'] as const) {
    for (const { part, p } of footSamples(rig, world, side)) {
      if (p.y < GROUND_CONTACT_M) contacts.push({ side, part, at: [p.x, p.z], height: p.y })
    }
  }
  const feet = { L: footState(contacts, 'L'), R: footState(contacts, 'R') }
  const supportPolygon = convexHull(contacts.map((c) => c.at))
  const shiftTarget = closestOnHull(supportPolygon, comGround)
  const outsideBy = shiftTarget ? dist(comGround, shiftTarget) : Infinity
  const centre = hullCentroid(supportPolygon)
  const leanLength = centre ? dist(comGround, centre) : 0
  const lean = centre ? { from: comGround, to: centre, length: leanLength, angle: Math.atan2(leanLength, Math.max(comV.y, 1e-6)) } : null

  const warnings: string[] = []
  if (!contacts.length) warnings.push(NO_CONTACT_WARNING)
  else if (outsideBy > COM_OUTSIDE_TOLERANCE_M) warnings.push(`${OUTSIDE_WARNING} by ${(outsideBy * CM_PER_M).toFixed(1)} cm`)

  const prev = input.previous
  if (prev) {
    for (const side of ['L', 'R'] as const) {
      if (feet[side] !== 'planted' || prev.feet[side] !== 'planted') continue
      const now = contactCentroid(contacts, side)
      const before = contactCentroid(prev.contacts, side)
      if (now && before && dist(now, before) > FOOT_SLIDE_M) warnings.push(`${SIDE_LABEL[side]} foot sliding`)
    }
  }

  return { com, comGround, contacts, feet, supportPolygon, outsideBy, shiftTarget, lean, weight: weightShare(contacts, comGround), warnings }
}

/** A lean direction is named when it carries at least this share of the lean (about 22° off the other axis). */
const LEAN_DIRECTION_SHARE = 0.38

/** Short reading for the HUD, e.g. "4° forward-left". Directions are the figure's own (root yaw). */
export function leanLabel(b: BalanceResult, rootYaw: number): string | null {
  if (!b.lean || b.lean.length < COM_OUTSIDE_TOLERANCE_M / 2) return null
  // From the support centre toward the CoM, in the figure's frame (figure faces +Z, its left is +X).
  const dx = b.lean.from[0] - b.lean.to[0]
  const dz = b.lean.from[1] - b.lean.to[1]
  const c = Math.cos(rootYaw)
  const s = Math.sin(rootYaw)
  const fwd = dx * s + dz * c
  const left = dx * c - dz * s
  const parts: string[] = []
  const minor = b.lean.length * LEAN_DIRECTION_SHARE
  if (Math.abs(fwd) > minor) parts.push(fwd > 0 ? 'forward' : 'back')
  if (Math.abs(left) > minor) parts.push(left > 0 ? 'left' : 'right')
  return `${radToDeg(b.lean.angle).toFixed(1)}° ${parts.join('-')}`
}
