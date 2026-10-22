// Pose solve from sketch landmarks (docs/solver-spec.md §2–4), staged:
//   1. Root placement (§2): the figure depth is searched (see solvePose), the hip joints are put on their
//      rays, which fixes the root position and heading; grounding then stands the figure on the floor.
//   2. Torso: neck, shoulders and the optional waist / chest are depth-resolved from the hips, then the
//      spine and chest share the bend. Head tilt from crown + chin, head turn from the gaze point.
//   3. Limb IK (§3) + depth resolve (§4): each elbow/knee and wrist/ankle is put on its ray at bone length
//      from its parent (both depth solutions are tried, occlusion hints pick), the limb is aimed
//      analytically and clamped to joint limits, and CCD (8 iterations, limits enforced) polishes the
//      wrist/ankle when clamping or locks left it short.
// The result is an ordinary editable pose. Pure math over the rig, no store.
import { Matrix4, Quaternion, Vector2, Vector3 } from 'three'
import type { Rig } from '../three/bodyRig'
import { JOINT_NAMES, type CameraState, type JointName, type JointRotation, type PoseState, type RootTransform, type Side, type Vec2, type Vec3 } from '../types/scene'
import { confidenceFromResidual, pickByHint, resolveDepth, type Confidence, type DepthCandidate } from './depthResolve'
import { bodySamples, forwardKinematics, jointPosition, lowestPoint, quatToRotation, type WorldPose } from './fk'
import { IK_CHAINS, IK_REACH_TOLERANCE_M, solveIk, type IkChainId } from './ik'
import { clampRotation } from './jointLimits'
import { LANDMARKS, type DepthHint, type LandmarkId } from './landmarks'
import { cameraModel, distanceToRay, pointAtDepth, project, rayPlaneY, rayThrough, viewDepth, viewDir, type Ray } from './projection'

// ---- Tuning (all lengths in meters) ----

/** Depth search window around the body-size estimate (fractions of it). */
export const DEPTH_SEARCH_MIN = 0.5
export const DEPTH_SEARCH_MAX = 1.6
/** Coarse depth samples across the window, then bisection steps at the far edge of the fitting range. */
const DEPTH_SEARCH_STEPS = 44
const DEPTH_REFINE_STEPS = 10
/** A depth whose (trimmed) mean landmark residual is within this (m) of the best still "fits the drawing". */
export const DEPTH_FIT_TOLERANCE_M = 0.001
/** Best-depth residual (m) up to which the drawing counts as consistent with the mannequin (then the far edge is used). */
export const DEPTH_CONSISTENT_M = 0.005
/** Golden ratio, for the golden-section depth refinement. */
const GOLDEN = (1 + Math.sqrt(5)) / 2
/** The depth cost ignores the worst 1 in this many landmarks, so one misplaced or impossible mark cannot drag the depth. */
const DEPTH_TRIM_EVERY = 8
/** solver-spec §2: a foot within this of the ground plane is snapped onto it. */
export const FOOT_SNAP_M = 0.06
/** Below this many size estimates the smallest is used; otherwise the second smallest (one outlier allowed). */
const MIN_SIZE_ESTIMATES_FOR_ROBUST = 4
/** Joint-limit clamping (rad, summed over channels) is weighed like this many meters of residual. */
const CLAMP_COST_M_PER_RAD = 0.05
/** Distance to the pre-solve joint position is weighed at this fraction, so re-solves stay put on ties. */
const PRIOR_WEIGHT = 0.05
/** Two choices whose scores differ by less than this (m) are both plausible: the joint is flagged ambiguous. */
const AMBIGUITY_SCORE_M = 0.02
/** Lean away from vertical (1 − cos) is weighed at this many meters when choosing a torso depth. */
const UPRIGHT_WEIGHT_M = 0.1
/** Shoulder axis twist away from the hip axis (1 − cos) is weighed at this many meters. */
const TWIST_WEIGHT_M = 0.1
/** Below this the projected foot direction is too short (frame heights) to tell the facing. */
const MIN_TOE_SCREEN_LENGTH = 0.005
/** Probe length (m) used to project a direction into the frame. */
const DIRECTION_PROBE_M = 0.2
/** Spine-chest share iterations: the chest node moves as the spine turns. */
const TORSO_ITERATIONS = 4
/** Head-turn search: steps across the combined neck + head twist range. */
const GAZE_SEARCH_STEPS = 48
/** A toe direction agreeing with the facing is worth up to this many meters when choosing the hip turn. */
const FACING_WEIGHT_M = 0.05
/**
 * The bend plane of a nearly straight limb is set by landmark noise, not by the drawing. Below this bend
 * (rad) the limb's twist is blended toward its natural one (no twist from the parent), fully natural at 0.
 */
const BEND_PLANE_FULL_RAD = (25 * Math.PI) / 180
/** Vectors shorter than this give no usable direction. */
const EPS = 1e-6

const Y = new Vector3(0, 1, 0)
const REST_ROOT: RootTransform = { position: [0, 0, 0], rotation: [0, 0, 0] }
const UP = Y

export interface PoseSolveInput {
  rig: Rig
  camera: CameraState
  /** Frame space (lib/sketchSpace.ts). */
  landmarks: Partial<Record<LandmarkId, Vec2>>
  hints: Partial<Record<LandmarkId, DepthHint>>
  /** The pose before solving: locked joints, hands and depth nudges are kept; it breaks depth ties. */
  current: PoseState
  locked: ReadonlySet<JointName>
  /**
   * Stand the figure on the ground plane (default). Figure and camera move together, so the drawing still
   * lines up: this sets the camera height from the figure. Off for a jump or a fall: the figure keeps its
   * height relative to the current camera.
   */
  feetOnGround?: boolean
}

export interface JointReport {
  /** Worst distance (m) from the joint to its landmark rays. */
  residual: number
  confidence: Confidence
  /** Both depth solutions fit and no hint chose: worth a look. */
  ambiguous: boolean
  /** IK could not reach the target (solver-spec §3: at least yellow). */
  unreachable: boolean
}

export const LIMB_IDS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'] as const
export type LimbId = (typeof LIMB_IDS)[number]

export const LIMB_JOINTS: Record<LimbId, readonly JointName[]> = {
  torso: ['hips', 'spine', 'chest', 'neck'],
  head: ['head'],
  armL: ['upperArmL', 'forearmL', 'handL'],
  armR: ['upperArmR', 'forearmR', 'handR'],
  legL: ['thighL', 'shinL', 'footL', 'toeL'],
  legR: ['thighR', 'shinR', 'footR', 'toeR'],
}

export interface PoseSolution {
  pose: PoseState
  /** Only joints a landmark constrains are reported. */
  joints: Partial<Record<JointName, JointReport>>
  limbs: Partial<Record<LimbId, Confidence>>
  /** The figure was stood on the ground plane (camera moved with it, so the view is unchanged). */
  grounded: boolean
  /** View depth (m) of the hip centre. */
  depth: number
  /** Feet snapped onto the ground plane. */
  planted: Side[]
  /** Same view: position moved with the figure when grounding, target moved to the figure's depth. */
  camera: CameraState
  warnings: string[]
}

export type PoseSolveResult = { ok: true; solution: PoseSolution } | { ok: false; reason: string }

// ---- Small vector helpers ----

const v3 = (v: Vec3): Vector3 => new Vector3(...v)
const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z]
const unit = (v: Vector3): Vector3 => v.clone().normalize()
const mid = (a: Vector3, b: Vector3): Vector3 => a.clone().add(b).multiplyScalar(0.5)

/** Rotation whose columns are the given axes. Y is kept exactly; X is made orthogonal to it. */
function frameFromYX(yAxis: Vector3, xHint: Vector3): Quaternion {
  const y = unit(yAxis)
  let x = xHint.clone().addScaledVector(y, -xHint.dot(y))
  if (x.length() < EPS) x = Math.abs(y.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1)
  x.addScaledVector(y, -x.dot(y)).normalize()
  const z = new Vector3().crossVectors(x, y)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

/** Rotation whose columns are the given axes. Z is kept exactly; Y is made orthogonal to it. */
function frameFromZY(zAxis: Vector3, yHint: Vector3): Quaternion {
  const z = unit(zAxis)
  let y = yHint.clone().addScaledVector(z, -yHint.dot(z))
  if (y.length() < EPS) y = Math.abs(z.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  y.addScaledVector(z, -y.dot(z)).normalize()
  const x = new Vector3().crossVectors(y, z)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

const worldQuat = (world: WorldPose, j: JointName): Quaternion => {
  const q = new Quaternion()
  world[j].decompose(new Vector3(), q, new Vector3())
  return q
}

/** Local rotation that gives `worldRot` under a parent whose world rotation is `parentRot`. */
const localFrom = (parentRot: Quaternion, worldRot: Quaternion): Quaternion => parentRot.clone().invert().multiply(worldRot)

/** Total joint-limit clamping of a raw rotation (rad, summed over channels). */
function clampCost(j: JointName, raw: JointRotation): number {
  const c = clampRotation(j, raw)
  return Math.abs(raw.rx - c.rx) + Math.abs(raw.ry - c.ry) + Math.abs(raw.rz - c.rz)
}

/** Rotation that turns a node so its child `childOffset` points along `dir`, with the least turn from `from`. */
function aimFrom(from: Quaternion, childOffset: Vector3, dir: Vector3): Quaternion {
  const current = unit(childOffset).applyQuaternion(from)
  return new Quaternion().setFromUnitVectors(current, unit(dir)).multiply(from)
}

const restLength = (rig: Rig, j: JointName): number => v3(rig[j].offset).length()

interface Choice<T> {
  value: T
  score: number
}

/** Best choice, and whether a different one comes within AMBIGUITY_SCORE_M of it. */
function best<T>(choices: Choice<T>[], same: (a: T, b: T) => boolean): { value: T; ambiguous: boolean } | null {
  const sorted = [...choices].sort((a, b) => a.score - b.score)
  const top = sorted[0]
  if (!top) return null
  const rival = sorted.find((c) => !same(c.value, top.value))
  return { value: top.value, ambiguous: rival !== undefined && rival.score - top.score < AMBIGUITY_SCORE_M }
}

/** Candidates allowed by a hint (all of them without one). */
function hinted(cands: DepthCandidate[], hint: DepthHint | undefined): DepthCandidate[] {
  if (cands.length < 2 || !hint) return cands
  const c = pickByHint({ candidates: cands, ambiguous: true }, hint)
  return c ? [c] : cands
}

/** Mean after dropping the largest 1-in-DEPTH_TRIM_EVERY values. */
function trimmedMean(values: number[]): number {
  if (values.length === 0) return 0
  const keep = [...values].sort((a, b) => a - b).slice(0, values.length - Math.floor(values.length / DEPTH_TRIM_EVERY))
  return keep.reduce((a, v) => a + v, 0) / keep.length
}

// ---- The solver ----

/**
 * Depth search: a drawn bone can only look shorter than it is (foreshortening), so a figure placed too far
 * away cannot reach its landmarks, while one placed nearer can always fit by tilting bones in depth. The
 * solve takes the farthest depth that still fits the drawing (the least foreshortened reading) over a
 * window around the body-size estimate, then refines it by bisection. A hand-drawn figure never fits a
 * rigid mannequin exactly; when even the best depth leaves a clear residual, the cost curve is shallow and
 * its far edge means little, so the best-fitting depth itself is taken instead.
 */
export function solvePose(input: PoseSolveInput): PoseSolveResult {
  const first = stagedSolve(input, { depth: null, ground: null })
  if (!first.ok) return first
  const lo = first.sizeDepth * DEPTH_SEARCH_MIN
  const hi = first.sizeDepth * DEPTH_SEARCH_MAX
  const costAt = (depth: number): number => {
    const r = stagedSolve(input, { depth, ground: null })
    return r.ok ? r.cost : Infinity
  }
  const grid = Array.from({ length: DEPTH_SEARCH_STEPS + 1 }, (_, i) => lo + ((hi - lo) * i) / DEPTH_SEARCH_STEPS)
  const costs = grid.map(costAt)
  const minCost = Math.min(...costs)
  let depth: number
  if (minCost <= DEPTH_CONSISTENT_M) {
    const fits = (c: number): boolean => c <= minCost + DEPTH_FIT_TOLERANCE_M
    let k = 0
    costs.forEach((c, i) => {
      if (fits(c)) k = i
    })
    let near = grid[k] as number
    const next = grid[k + 1]
    if (next !== undefined) {
      let far: number = next
      for (let i = 0; i < DEPTH_REFINE_STEPS; i++) {
        const m: number = (near + far) / 2
        if (fits(costAt(m))) near = m
        else far = m
      }
    }
    depth = near
  } else {
    // Golden-section search around the best grid sample.
    const k = costs.indexOf(minCost)
    let a = grid[Math.max(0, k - 1)] as number
    let b = grid[Math.min(grid.length - 1, k + 1)] as number
    for (let i = 0; i < DEPTH_REFINE_STEPS; i++) {
      const m1 = b - (b - a) / GOLDEN
      const m2 = a + (b - a) / GOLDEN
      if (costAt(m1) <= costAt(m2)) b = m2
      else a = m1
    }
    const mid2 = (a + b) / 2
    depth = costAt(mid2) <= minCost ? mid2 : (grid[k] as number)
  }

  const free = stagedSolve(input, { depth, ground: null })
  if (!free.ok) return free
  const feetOnGround = input.feetOnGround ?? true
  const cam = cameraModel(input.camera)
  let result = free
  let shift = new Vector3()
  if (feetOnGround) {
    // Feet whose lowest point is within the snap distance of the lowest body point stand on the ground.
    const world = forwardKinematics(input.rig, free.solution.pose.joints, free.solution.pose.rootTransform)
    const low = lowestPoint(input.rig, world)
    const samples = bodySamples(input.rig, world)
    const sides = (['L', 'R'] as const).filter((s) =>
      [...samples[`foot${s}`], ...samples[`toe${s}`]].some((p) => p.y - low < FOOT_SNAP_M),
    )
    const snapped = sides.length ? stagedSolve(input, { depth, ground: { y: low, sides } }) : free
    if (snapped.ok) result = snapped
    const r = result.solution.pose.rootTransform
    const finalLow = lowestPoint(input.rig, forwardKinematics(input.rig, result.solution.pose.joints, r))
    // Move figure and camera together: the figure over the world origin, its lowest point on the ground.
    const hips = jointPosition(forwardKinematics(input.rig, result.solution.pose.joints, r), 'hips')
    shift = new Vector3(-hips.x, -finalLow, -hips.z)
  }
  const sol = result.solution
  const rootPos = v3(sol.pose.rootTransform.position).add(shift)
  const camPos = cam.position.clone().add(shift)
  // Same view: the look direction is kept and the target sits at the figure's depth.
  const target = camPos.clone().addScaledVector(viewDir(cam), sol.depth)
  return {
    ok: true,
    solution: {
      ...sol,
      pose: { ...sol.pose, rootTransform: { ...sol.pose.rootTransform, position: toVec3(rootPos) } },
      grounded: feetOnGround,
      camera: { ...input.camera, position: toVec3(camPos), target: toVec3(target) },
    },
  }
}

interface StageOpts {
  /** View depth (m) of the hip centre; null = the size estimate. */
  depth: number | null
  /** Ground plane height and the feet planted on it (snapped, solver-spec §2). */
  ground: { y: number; sides: Side[] } | null
}

type StageResult = { ok: true; solution: PoseSolution; cost: number; sizeDepth: number } | { ok: false; reason: string }

/** One staged solve with the figure at a given depth. */
export function stagedSolve(input: PoseSolveInput, opts: StageOpts): StageResult {
  const { rig, landmarks: lm, hints, current, locked } = input
  const cam = cameraModel(input.camera)
  const warnings: string[] = []
  const ray = (id: LandmarkId): Ray | null => {
    const p = lm[id]
    return p ? rayThrough(cam, p) : null
  }
  const rays = Object.fromEntries((Object.keys(lm) as LandmarkId[]).map((id) => [id, ray(id)])) as Partial<Record<LandmarkId, Ray>>
  const hipLRay = rays.hipL
  const hipRRay = rays.hipR
  if (!hipLRay || !hipRRay || !lm.hipL || !lm.hipR) return { ok: false, reason: 'Mark both hips: the solve starts from them.' }
  if (!rays.neck && !(rays.shoulderL && rays.shoulderR)) return { ok: false, reason: 'Mark the neck base, or both shoulders, to set the torso.' }

  const joints: Record<JointName, JointRotation> = { ...current.joints }
  const reports: Partial<Record<JointName, JointReport>> = {}
  const ambiguous = new Set<JointName>()
  const unreachable = new Set<JointName>()
  const flagAmbiguous = (id: LandmarkId, isAmbiguous: boolean): void => {
    if (isAmbiguous && !hints[id]) ambiguous.add(LANDMARKS[id].joint)
  }
  /** The pose before solving, for tie-breaks. */
  const priorWorld = forwardKinematics(rig, current.joints, current.rootTransform)
  const prior = (j: JointName): Vector3 => jointPosition(priorWorld, j)

  // Rest geometry (zero rotations, root at the origin).
  const restWorld = forwardKinematics(rig, Object.fromEntries(JOINT_NAMES.map((j) => [j, { rx: 0, ry: 0, rz: 0 }])) as Record<JointName, JointRotation>, REST_ROOT)
  const rest = (j: JointName): Vector3 => jointPosition(restWorld, j)
  const restCrown = new Vector3(0, headCenterY(rig) + headRadius(rig), 0).applyMatrix4(restWorld.head)
  const restChin = new Vector3(0, headCenterY(rig) - headRadius(rig), 0).applyMatrix4(restWorld.head)
  const hipCenterLocal = mid(v3(rig.thighL.offset), v3(rig.thighR.offset))
  const halfHip = v3(rig.thighL.offset).distanceTo(v3(rig.thighR.offset)) / 2
  const ankleHeight = (side: Side): number => rest(`foot${side}`).y
  const toeHeight = (side: Side): number => rest(`toe${side}`).y

  // ================= 1. Root placement (§2) =================

  // Size-based depth: each pair of landmarks with a known rest distance bounds the depth from above
  // (foreshortening only shortens the drawn length), so the smallest estimates are the most trustworthy.
  const sizePairs: [LandmarkId, LandmarkId, number][] = [
    ['hipL', 'hipR', 2 * halfHip],
    ['shoulderL', 'shoulderR', rest('upperArmL').distanceTo(rest('upperArmR'))],
    ['head', 'chin', restCrown.distanceTo(restChin)],
    ['hipL', 'kneeL', restLength(rig, 'shinL')],
    ['hipR', 'kneeR', restLength(rig, 'shinR')],
    ['kneeL', 'ankleL', restLength(rig, 'footL')],
    ['kneeR', 'ankleR', restLength(rig, 'footR')],
    ['shoulderL', 'elbowL', restLength(rig, 'forearmL')],
    ['shoulderR', 'elbowR', restLength(rig, 'forearmR')],
    ['elbowL', 'wristL', restLength(rig, 'handL')],
    ['elbowR', 'wristR', restLength(rig, 'handR')],
  ]
  const hipMid2: Vec2 = [(lm.hipL[0] + lm.hipR[0]) / 2, (lm.hipL[1] + lm.hipR[1]) / 2]
  const sizeEstimates: number[] = []
  for (const [a, b, len] of sizePairs) {
    const pa = lm[a]
    const pb = lm[b]
    if (!pa || !pb) continue
    const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
    if (d > EPS) sizeEstimates.push((cam.f * len) / d)
  }
  if (lm.neck) {
    const d = Math.hypot(lm.neck[0] - hipMid2[0], lm.neck[1] - hipMid2[1])
    const len = rest('neck').distanceTo(mid(rest('thighL'), rest('thighR')))
    if (d > EPS) sizeEstimates.push((cam.f * len) / d)
  }
  sizeEstimates.sort((a, b) => a - b)
  const sizeDepth = (sizeEstimates.length >= MIN_SIZE_ESTIMATES_FOR_ROBUST ? sizeEstimates[1] : sizeEstimates[0]) ?? null
  if (sizeDepth === null) return { ok: false, reason: 'The landmarks are on top of each other; spread them over the figure.' }

  // Planted feet (grounding pass only): the ankle goes where its ray meets the ground plane.
  const groundAnkle: Partial<Record<Side, Vector3>> = {}
  for (const side of opts.ground?.sides ?? []) {
    const r = rays[`ankle${side}`]
    const t = r && opts.ground ? rayPlaneY(r, opts.ground.y + ankleHeight(side)) : null
    if (r && t !== null) groundAnkle[side] = r.origin.clone().addScaledVector(r.dir, t)
  }
  const planted = (['L', 'R'] as const).filter((s) => groundAnkle[s] !== undefined)

  const hipMidRay = rayThrough(cam, hipMid2)
  const hipCenter = pointAtDepth(cam, hipMidRay, opts.depth ?? sizeDepth)

  // Hip axis: the left hip joint on its ray at half the hip width from the centre (two solutions = turned
  // left or right by the same amount). Toe directions, then hints, then the previous pose decide.
  const hipCands = resolveDepth(hipLRay, hipCenter, halfHip).candidates
  const toeScreen = new Vector2()
  for (const side of ['L', 'R'] as const) {
    const a = lm[`ankle${side}`]
    const t = lm[`toe${side}`]
    if (a && t) toeScreen.add(new Vector2(t[0] - a[0], t[1] - a[1]))
  }
  const forwardOf = (hipL: Vector3, up: Vector3): Vector3 => {
    const x = unit(hipL.clone().sub(hipCenter))
    return new Vector3().crossVectors(x, up).normalize()
  }
  const screenDir = (from: Vector3, dir: Vector3): Vector2 | null => {
    const a = project(cam, from)
    const b = project(cam, from.clone().addScaledVector(dir, DIRECTION_PROBE_M))
    return a && b ? new Vector2(b[0] - a[0], b[1] - a[1]) : null
  }
  const priorHipRel = prior('thighL').sub(mid(prior('thighL'), prior('thighR')))
  // A right-hip hint is the opposite left-hip hint (the two move in opposite depth directions).
  const hipHint: DepthHint | undefined = hints.hipL ?? (hints.hipR ? (hints.hipR === 'toward' ? 'away' : 'toward') : undefined)
  const hipChoices: Choice<DepthCandidate>[] = hinted(hipCands, hipHint).map((c) => {
    let score = c.residual + PRIOR_WEIGHT * c.point.clone().sub(hipCenter).distanceTo(priorHipRel)
    // Hip R must land on its own ray.
    score += distanceToRay(hipRRay, hipCenter.clone().multiplyScalar(2).sub(c.point))
    if (toeScreen.length() > MIN_TOE_SCREEN_LENGTH) {
      const fwd = screenDir(hipCenter, forwardOf(c.point, UP))
      if (fwd && fwd.length() > EPS) score -= FACING_WEIGHT_M * fwd.normalize().dot(toeScreen.clone().normalize())
    }
    return { value: c, score }
  })
  const hipPick = best(hipChoices, (a, b) => a.point.distanceTo(b.point) < EPS)
  if (!hipPick) return { ok: false, reason: 'The hips could not be placed.' }
  const hipL3 = hipPick.value.point
  const hipR3 = hipCenter.clone().multiplyScalar(2).sub(hipL3)
  if (!hipHint) {
    flagAmbiguous('hipL', hipPick.ambiguous)
    flagAmbiguous('hipR', hipPick.ambiguous)
  }
  const hipAxis = unit(hipL3.clone().sub(hipR3))

  // ================= 2. Torso =================

  /** Depth-resolve a torso landmark from a 3D anchor, preferring an upright direction. */
  const torsoPoint = (id: LandmarkId, anchor: Vector3, length: number, preferDir: Vector3): Vector3 | null => {
    const r = rays[id]
    if (!r) return null
    const cands = hinted(resolveDepth(r, anchor, length).candidates, hints[id])
    const pick = best(
      cands.map((c) => ({ value: c, score: c.residual + UPRIGHT_WEIGHT_M * (1 - unit(c.point.clone().sub(anchor)).dot(preferDir)) })),
      (a, b) => a.point.distanceTo(b.point) < EPS,
    )
    if (!pick) return null
    flagAmbiguous(id, pick.ambiguous)
    return pick.value.point
  }

  const restHipCenter = mid(rest('thighL'), rest('thighR'))
  const neck3 = rays.neck ? torsoPoint('neck', hipCenter, rest('neck').distanceTo(restHipCenter), UP) : null
  const waist3 = torsoPoint('waist', hipCenter, rest('spine').distanceTo(restHipCenter), neck3 ? unit(neck3.clone().sub(hipCenter)) : UP)

  // Shoulders: both on their rays at the rest distance from the neck (or the hip centre without a neck).
  const shoulderAnchor = neck3 ?? hipCenter
  const shoulderAnchorRest = neck3 ? rest('neck') : restHipCenter
  const shoulderPts: Partial<Record<Side, Vector3>> = {}
  if (rays.shoulderL && rays.shoulderR) {
    const candsL = hinted(resolveDepth(rays.shoulderL, shoulderAnchor, rest('upperArmL').distanceTo(shoulderAnchorRest)).candidates, hints.shoulderL)
    const candsR = hinted(resolveDepth(rays.shoulderR, shoulderAnchor, rest('upperArmR').distanceTo(shoulderAnchorRest)).candidates, hints.shoulderR)
    const width = rest('upperArmL').distanceTo(rest('upperArmR'))
    const combos: Choice<[DepthCandidate, DepthCandidate]>[] = []
    for (const l of candsL) {
      for (const r of candsR) {
        const axis = l.point.clone().sub(r.point)
        const twist = axis.length() > EPS ? 1 - unit(axis).dot(hipAxis) : 1
        combos.push({ value: [l, r], score: l.residual + r.residual + Math.abs(axis.length() - width) + TWIST_WEIGHT_M * twist })
      }
    }
    const pick = best(combos, (a, b) => a[0].point.distanceTo(b[0].point) < EPS && a[1].point.distanceTo(b[1].point) < EPS)
    if (pick) {
      shoulderPts.L = pick.value[0].point
      shoulderPts.R = pick.value[1].point
      flagAmbiguous('shoulderL', pick.ambiguous)
      flagAmbiguous('shoulderR', pick.ambiguous)
    }
  }
  const shoulderAxis = shoulderPts.L && shoulderPts.R ? unit(shoulderPts.L.clone().sub(shoulderPts.R)) : hipAxis
  const torsoTop = neck3 ?? (shoulderPts.L && shoulderPts.R ? mid(shoulderPts.L, shoulderPts.R) : hipCenter.clone().add(UP))

  // Hips frame: X along the hip joints, Y toward the waist (or the top of the torso).
  const hipsWorld = frameFromYX((waist3 ?? torsoTop).clone().sub(hipCenter), hipAxis)
  const hipsZ = new Vector3(0, 0, 1).applyQuaternion(hipsWorld)
  const yaw = Math.atan2(hipsZ.x, hipsZ.z)
  const rootRot = new Quaternion().setFromAxisAngle(Y, yaw)
  const hipsNode = hipCenter.clone().sub(hipCenterLocal.clone().applyQuaternion(hipsWorld))
  const rootPos = hipsNode.clone().sub(v3(rig.hips.offset).applyQuaternion(rootRot))
  const root = { position: toVec3(rootPos), rotation: [0, yaw, 0] as Vec3 }
  const setJoint = (j: JointName, q: Quaternion): void => {
    if (!locked.has(j)) joints[j] = clampRotation(j, quatToRotation(q))
  }
  setJoint('hips', localFrom(rootRot, hipsWorld))
  let world = forwardKinematics(rig, joints, root)

  // Spine + chest share the bend toward the neck; the optional chest landmark sets the split.
  const chest3 = torsoPoint('chest', jointPosition(world, 'spine'), restLength(rig, 'chest'), unit(torsoTop.clone().sub(hipCenter)))
  if (neck3 || (shoulderPts.L && shoulderPts.R)) {
    const hipsW = worldQuat(world, 'hips')
    const spinePos = jointPosition(world, 'spine')
    // The top target: the neck base, or the shoulder midpoint taken back to neck-base height.
    const top = neck3 ?? mid(shoulderPts.L as Vector3, shoulderPts.R as Vector3).add(
      rest('neck').sub(mid(rest('upperArmL'), rest('upperArmR'))).applyQuaternion(hipsW),
    )
    let spineW = hipsW.clone()
    let chestW = hipsW.clone()
    for (let i = 0; i < TORSO_ITERATIONS; i++) {
      const chestPos = spinePos.clone().add(v3(rig.chest.offset).applyQuaternion(spineW))
      // The neck base sits straight up the chest's Y axis, so the chest aims its Y at it.
      chestW = frameFromYX(top.clone().sub(chestPos), shoulderAxis)
      spineW = chest3 ? frameFromYX(chest3.clone().sub(spinePos), hipAxis) : hipsW.clone().slerp(chestW, 0.5)
    }
    setJoint('spine', localFrom(hipsW, spineW))
    world = forwardKinematics(rig, joints, root)
    setJoint('chest', localFrom(worldQuat(world, 'spine'), chestW))
    world = forwardKinematics(rig, joints, root)
  }

  // Clavicles: turn each shoulder joint (within its small range) so the arm root meets the shoulder landmark.
  for (const side of ['L', 'R'] as const) {
    const target = shoulderPts[side]
    const j: JointName = `shoulder${side}`
    if (!target || locked.has(j)) continue
    const from = worldQuat(world, j)
    const pos = jointPosition(world, j)
    const aimed = aimFrom(from, v3(rig[`upperArm${side}`].offset), target.clone().sub(pos))
    setJoint(j, localFrom(worldQuat(world, 'chest'), aimed))
    world = forwardKinematics(rig, joints, root)
  }

  // Neck + head: crown on its ray from the neck base, chin gives the tilt, gaze gives the turn.
  solveHead()

  // ================= 3. Limbs: IK (§3) + depth resolve (§4) =================

  for (const side of ['L', 'R'] as const) {
    solveLimb(side === 'L' ? 'armL' : 'armR', `elbow${side}`, `wrist${side}`, null)
    solveLimb(side === 'L' ? 'legL' : 'legR', `knee${side}`, `ankle${side}`, groundAnkle[side] ?? null)
    solveFoot(side)
  }

  // ================= Report =================

  world = forwardKinematics(rig, joints, root)
  const pointOf = (id: LandmarkId): Vector3 => {
    if (id === 'head') return new Vector3(0, headCenterY(rig) + headRadius(rig), 0).applyMatrix4(world.head)
    if (id === 'chin') return new Vector3(0, headCenterY(rig) - headRadius(rig), 0).applyMatrix4(world.head)
    return jointPosition(world, LANDMARKS[id].joint)
  }
  const own: number[] = []
  for (const id of Object.keys(rays) as LandmarkId[]) {
    const r = rays[id]
    if (!r || id === 'gaze') continue
    const j = LANDMARKS[id].joint
    const ownResidual = distanceToRay(r, pointOf(id))
    own.push(ownResidual)
    const residual = Math.max(ownResidual, reports[j]?.residual ?? 0)
    let confidence = confidenceFromResidual(residual)
    if (unreachable.has(j) && confidence === 'green') confidence = 'yellow'
    reports[j] = { residual, confidence, ambiguous: ambiguous.has(j), unreachable: unreachable.has(j) }
  }
  // The hips node itself is judged by its two hip joints.
  const hipReports = [reports.thighL, reports.thighR].filter((r): r is JointReport => r !== undefined)
  if (hipReports.length) {
    const residual = Math.max(...hipReports.map((r) => r.residual))
    reports.hips = { residual, confidence: confidenceFromResidual(residual), ambiguous: hipReports.some((r) => r.ambiguous), unreachable: false }
  }
  const order: Confidence[] = ['green', 'yellow', 'red']
  const limbs: Partial<Record<LimbId, Confidence>> = {}
  for (const id of Object.keys(LIMB_JOINTS) as LimbId[]) {
    const cs = LIMB_JOINTS[id].map((j) => reports[j]?.confidence).filter((c): c is Confidence => c !== undefined)
    if (cs.length) limbs[id] = cs.reduce((a, c) => (order.indexOf(c) > order.indexOf(a) ? c : a), 'green')
  }

  if (!lm.head || !lm.chin) warnings.push('No crown and chin marked: the head keeps its previous tilt.')
  for (const side of ['L', 'R'] as const) if (!lm[`toe${side}`]) warnings.push(`No ${side === 'L' ? 'left' : 'right'} toes marked: that foot keeps its previous angle.`)

  return {
    ok: true,
    cost: trimmedMean(own),
    sizeDepth,
    solution: {
      pose: { ...current, joints, rootTransform: root },
      joints: reports,
      limbs,
      grounded: false,
      depth: viewDepth(cam, hipCenter),
      planted,
      camera: input.camera,
      warnings,
    },
  }

  // ---- Stage helpers (closures over the solve state) ----

  function solveHead(): void {
    const crownRay = rays.head
    if (!crownRay) return
    const neckPos = jointPosition(world, 'neck')
    const chestW = worldQuat(world, 'chest')
    const chestUp = Y.clone().applyQuaternion(chestW)
    const crownCands = hinted(resolveDepth(crownRay, neckPos, restCrown.distanceTo(rest('neck'))).candidates, hints.head)
    const crownPick = best(
      crownCands.map((c) => ({ value: c, score: c.residual + UPRIGHT_WEIGHT_M * (1 - unit(c.point.clone().sub(neckPos)).dot(chestUp)) })),
      (a, b) => a.point.distanceTo(b.point) < EPS,
    )
    if (!crownPick) return
    flagAmbiguous('head', crownPick.ambiguous)
    const crown = crownPick.value.point
    // Head axis from chin to crown; without a chin the head continues the neck.
    let headUp = unit(crown.clone().sub(neckPos))
    if (rays.chin) {
      const chinCands = resolveDepth(rays.chin, crown, 2 * headRadius(rig)).candidates
      const chinPick = best(
        chinCands.map((c) => ({ value: c, score: c.residual + UPRIGHT_WEIGHT_M * (1 - unit(crown.clone().sub(c.point)).dot(chestUp)) })),
        (a, b) => a.point.distanceTo(b.point) < EPS,
      )
      if (chinPick) headUp = unit(crown.clone().sub(chinPick.value.point))
    }
    const headNodePos = crown.clone().addScaledVector(headUp, -(headCenterY(rig) + headRadius(rig)))
    const chestFwd = new Vector3(0, 0, 1).applyQuaternion(chestW)
    const neckW = frameFromZY(chestFwd, headNodePos.clone().sub(neckPos))
    const fixNeck = frameFromYX(headNodePos.clone().sub(neckPos), new Vector3(1, 0, 0).applyQuaternion(neckW))
    const headBase = frameFromYX(headUp, new Vector3(1, 0, 0).applyQuaternion(fixNeck))

    // Head turn: search the twist about the head axis whose forward best matches the gaze direction.
    let twist = 0
    const gaze = lm.gaze
    if (gaze) {
      const centerLocal = new Vector3(0, headCenterY(rig), 0)
      const center = centerLocal.clone().applyQuaternion(headBase).add(headNodePos)
      const c2 = project(cam, center)
      if (c2) {
        const want = new Vector2(gaze[0] - c2[0], gaze[1] - c2[1])
        const range = maxTwist()
        let bestCos = -Infinity
        for (let i = 0; i <= GAZE_SEARCH_STEPS; i++) {
          const a = -range + (2 * range * i) / GAZE_SEARCH_STEPS
          const q = headBase.clone().multiply(new Quaternion().setFromAxisAngle(Y, a))
          const s = screenDir(center, new Vector3(0, 0, 1).applyQuaternion(q))
          if (!s || s.length() < EPS || want.length() < EPS) continue
          const cos = s.normalize().dot(want.clone().normalize())
          if (cos > bestCos) {
            bestCos = cos
            twist = a
          }
        }
      }
    }
    // Half the turn goes to the neck, the rest to the head.
    const neckFinal = fixNeck.clone().multiply(new Quaternion().setFromAxisAngle(Y, twist / 2))
    const headFinal = headBase.clone().multiply(new Quaternion().setFromAxisAngle(Y, twist))
    setJoint('neck', localFrom(chestW, neckFinal))
    world = forwardKinematics(rig, joints, root)
    setJoint('head', localFrom(worldQuat(world, 'neck'), headFinal))
    world = forwardKinematics(rig, joints, root)
  }

  function maxTwist(): number {
    const neck = clampRotation('neck', { rx: 0, ry: Math.PI, rz: 0 }).ry
    const head = clampRotation('head', { rx: 0, ry: Math.PI, rz: 0 }).ry
    return neck + head
  }

  /**
   * Aims a two-bone limb: the upper joint so its child points at the mid joint and the hinge plane holds
   * the end joint, the hinge bent to the angle between the two bones. Returns raw (unclamped) rotations.
   */
  function aimLimb(chain: IkChainId, midPt: Vector3, endPt: Vector3 | null): { upper: JointRotation; hinge: JointRotation } {
    const { hinge } = IK_CHAINS[chain]
    const upperJ = PARENT_OF_HINGE[chain]
    const parentJ = PARENT_OF_UPPER[chain]
    const parentW = worldQuat(world, parentJ)
    const base = jointPosition(world, upperJ)
    const a = unit(midPt.clone().sub(base))
    // Natural twist: the parent's forward axis, made square to the bone.
    const zNatural = new Vector3(0, 0, 1).applyQuaternion(parentW)
    zNatural.addScaledVector(a, -zNatural.dot(a))
    let zAxis = zNatural.lengthSq() > EPS ? zNatural.normalize() : new Vector3(0, 0, 1).applyQuaternion(parentW)
    let bend = 0
    if (endPt) {
      const b = unit(endPt.clone().sub(midPt))
      bend = Math.acos(Math.min(1, Math.max(-1, a.dot(b))))
      const p = b.clone().addScaledVector(a, -b.dot(a))
      if (p.length() > EPS) {
        // The hinge bends toward the upper bone's +Z for bendSign −1 (elbows) and −Z for +1 (knees).
        const zPlane = p.normalize().multiplyScalar(-hinge.bendSign)
        const t = Math.min(1, bend / BEND_PLANE_FULL_RAD)
        const blended = zAxis.clone().multiplyScalar(1 - t).addScaledVector(zPlane, t)
        if (blended.lengthSq() > EPS) zAxis = blended.normalize()
      }
    }
    const upperW = frameFromYX(a.clone().negate(), new Vector3().crossVectors(a.clone().negate(), zAxis))
    const upper = quatToRotation(localFrom(parentW, upperW))
    const cur = joints[hinge.joint]
    return { upper, hinge: { rx: endPt ? hinge.bendSign * bend : cur.rx, ry: cur.ry, rz: 0 } }
  }

  function solveLimb(chain: IkChainId, midId: LandmarkId, endId: LandmarkId, ground: Vector3 | null): void {
    const { hinge, effector } = IK_CHAINS[chain]
    const upperJ = PARENT_OF_HINGE[chain]
    const midRay = rays[midId]
    const endRay = rays[endId]
    if (!midRay && !endRay) return
    const base = jointPosition(world, upperJ)
    const upperLen = restLength(rig, hinge.joint)
    const lowerLen = restLength(rig, effector)

    if (midRay) {
      const midCands = hinted(resolveDepth(midRay, base, upperLen).candidates, hints[midId])
      type Combo = { mid: DepthCandidate; end: DepthCandidate | null; rot: ReturnType<typeof aimLimb> }
      const combos: Choice<Combo>[] = []
      for (const m of midCands) {
        let ends: (DepthCandidate | null)[] = [null]
        if (endRay) {
          ends = hinted(resolveDepth(endRay, m.point, lowerLen).candidates, hints[endId])
          if (ground) {
            // §2 snap: a planted ankle within FOOT_SNAP_M of fitting goes onto the ground plane.
            const residual = Math.abs(ground.distanceTo(m.point) - lowerLen)
            if (residual < FOOT_SNAP_M) ends = [{ point: ground, t: 0, residual }]
          }
        }
        for (const e of ends) {
          const rot = aimLimb(chain, m.point, e?.point ?? null)
          const score =
            m.residual +
            (e?.residual ?? 0) +
            CLAMP_COST_M_PER_RAD * (clampCost(upperJ, rot.upper) + clampCost(hinge.joint, rot.hinge)) +
            PRIOR_WEIGHT * (m.point.distanceTo(prior(hinge.joint)) + (e ? e.point.distanceTo(prior(effector)) : 0))
          combos.push({ value: { mid: m, end: e, rot }, score })
        }
      }
      const midPick = best(combos, (x, y) => x.mid.point.distanceTo(y.mid.point) < EPS)
      const endPick = best(combos, (x, y) => (x.end && y.end ? x.end.point.distanceTo(y.end.point) < EPS : x.end === y.end))
      if (!midPick) return
      flagAmbiguous(midId, midPick.ambiguous)
      if (endPick) flagAmbiguous(endId, endPick.ambiguous)
      const { rot, end } = midPick.value
      if (!locked.has(upperJ)) joints[upperJ] = clampRotation(upperJ, rot.upper)
      if (!locked.has(hinge.joint)) joints[hinge.joint] = clampRotation(hinge.joint, rot.hinge)
      world = forwardKinematics(rig, joints, root)
      // The mid joint is where the drawing puts it, so only the hinge may move to reach the end.
      if (end) polish(chain, end.point, false, [upperJ, PARENT_OF_UPPER[chain]])
      return
    }

    // No mid landmark: §3 as written. The end target is the landmark on a plane at the base's depth.
    if (endRay) {
      const target = ground ?? pointAtDepth(cam, endRay, viewDepth(cam, base))
      polish(chain, target, true)
    }
  }

  /** CCD toward the end target (respecting locks, limits and the held joints) when the analytic aim left it short. */
  function polish(chain: IkChainId, target: Vector3, always = false, hold: JointName[] = []): void {
    const { effector } = IK_CHAINS[chain]
    if (!always && jointPosition(world, effector).distanceTo(target) <= IK_REACH_TOLERANCE_M) return
    const r = solveIk({ rig, joints, root, chain, target, locked: new Set([...locked, ...hold]) })
    Object.assign(joints, r.joints)
    world = forwardKinematics(rig, joints, root)
    if (!r.reached) unreachable.add(effector)
  }

  function solveFoot(side: Side): void {
    const toeRay = rays[`toe${side}`]
    const foot: JointName = `foot${side}`
    if (!toeRay || locked.has(foot)) return
    const ankle = jointPosition(world, foot)
    const toeOffset = v3(rig[`toe${side}`].offset)
    let toe: Vector3 | null = null
    const groundT = planted.includes(side) && opts.ground ? rayPlaneY(toeRay, opts.ground.y + toeHeight(side)) : null
    if (groundT !== null) {
      toe = toeRay.origin.clone().addScaledVector(toeRay.dir, groundT)
    } else {
      const cands = hinted(resolveDepth(toeRay, ankle, toeOffset.length()).candidates, hints[`toe${side}`])
      // Prefer the foot closer to level with the ground.
      const pick = best(
        cands.map((c) => ({ value: c, score: c.residual + UPRIGHT_WEIGHT_M * Math.abs(unit(c.point.clone().sub(ankle)).y) })),
        (a, b) => a.point.distanceTo(b.point) < EPS,
      )
      if (pick) {
        toe = pick.value.point
        flagAmbiguous(`toe${side}`, pick.ambiguous)
      }
    }
    if (!toe) return
    const shinW = worldQuat(world, `shin${side}`)
    const forward = unit(toe.clone().sub(ankle))
    // Foot frame: the toe offset (in the foot's local YZ plane) points at the toe; the foot's up follows the shin.
    const oHat = unit(toeOffset)
    const uLocal = unit(Y.clone().addScaledVector(oHat, -Y.dot(oHat)))
    const local = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3().crossVectors(uLocal, oHat), uLocal, oHat))
    const shinUp = Y.clone().applyQuaternion(shinW)
    const uWorld = shinUp.addScaledVector(forward, -shinUp.dot(forward))
    if (uWorld.length() < EPS) return
    uWorld.normalize()
    const worldBasis = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3().crossVectors(uWorld, forward), uWorld, forward))
    const footW = worldBasis.multiply(local.invert())
    setJoint(foot, localFrom(shinW, footW))
    world = forwardKinematics(rig, joints, root)
  }
}

/** Upper joint of each two-bone limb (the hinge's parent) and that joint's parent. */
const PARENT_OF_HINGE: Record<IkChainId, JointName> = { armL: 'upperArmL', armR: 'upperArmR', legL: 'thighL', legR: 'thighR' }
const PARENT_OF_UPPER: Record<IkChainId, JointName> = { armL: 'shoulderL', armR: 'shoulderR', legL: 'hips', legR: 'hips' }

const headSphere = (rig: Rig): { center: Vec3; radius: number } => {
  const seg = rig.head.segment
  return seg.shape === 'sphere' ? { center: seg.center, radius: seg.radius } : { center: [0, 0, 0], radius: 0 }
}
/** Head sphere centre height above the head node, and its radius (m). */
export const headCenterY = (rig: Rig): number => headSphere(rig).center[1]
export const headRadius = (rig: Rig): number => headSphere(rig).radius

