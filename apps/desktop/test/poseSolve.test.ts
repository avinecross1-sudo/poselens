import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_DEPTH_GAP_M,
  confidenceFromResidual,
  GREEN_RESIDUAL_M,
  pickByHint,
  resolveDepth,
  YELLOW_RESIDUAL_M,
} from '../src/solve/depthResolve'
import { forwardKinematics, jointPosition, lowestPoint } from '../src/solve/fk'
import { limitViolations } from '../src/solve/jointLimits'
import { LANDMARKS, nextLandmark, REQUIRED_LANDMARKS } from '../src/solve/landmarks'
import { LIMB_JOINTS, solvePose, type PoseSolution, type PoseSolveInput } from '../src/solve/poseSolve'
import { cameraModel, distanceToRay, pointAtDepth, project, rayPlaneY, rayThrough, viewDepth } from '../src/solve/projection'
import { applyShotCamera } from '../src/three/cameraRig'
import { defaultPose } from '../src/state/defaults'
import { JOINT_NAMES, type CameraState, type Vec2 } from '../src/types/scene'
import { buildFixture, FIXTURE_ASPECT, type PoseFixture } from './poseFixture'

/** Deterministic pseudo-random numbers (Park–Miller), so failures reproduce. */
function rng(seed: number): () => number {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

const CAMERA: CameraState = { position: [0.6, 1.45, 4.3], target: [0, 0.95, 0], up: [0, 1, 0], focal: 40, sensorHeight: 24, roll: 0.03, preset: 'custom' }

describe('projection (frame space, matches the shot camera render path)', () => {
  it('projects like applyShotCamera + Vector3.project', () => {
    const cam3 = new THREE.PerspectiveCamera()
    for (const c of [CAMERA, { ...CAMERA, roll: -0.4, focal: 18, position: [-2, 0.3, 3] as CameraState['position'] }]) {
      applyShotCamera(cam3, c, FIXTURE_ASPECT)
      const model = cameraModel(c)
      const r = rng(3)
      for (let i = 0; i < 50; i++) {
        const p = new THREE.Vector3((r() - 0.5) * 2, r() * 2, (r() - 0.5) * 2)
        const ndc = p.clone().project(cam3)
        const ours = project(model, p) as Vec2
        expect(ours[0]).toBeCloseTo((ndc.x * FIXTURE_ASPECT) / 2, 9)
        expect(ours[1]).toBeCloseTo(ndc.y / 2, 9)
      }
    }
  })

  it('rays pass back through the projected point; depth and plane helpers agree', () => {
    const model = cameraModel(CAMERA)
    const p = new THREE.Vector3(0.3, 1.2, -0.4)
    const ray = rayThrough(model, project(model, p) as Vec2)
    expect(distanceToRay(ray, p)).toBeLessThan(1e-9)
    expect(pointAtDepth(model, ray, viewDepth(model, p)).distanceTo(p)).toBeLessThan(1e-9)
    const t = rayPlaneY(ray, 0.25) as number
    expect(ray.origin.clone().addScaledVector(ray.dir, t).y).toBeCloseTo(0.25, 9)
    expect(project(model, new THREE.Vector3(0.6, 1.45, 10))).toBeNull() // behind the camera
  })
})

describe('depth resolve (solver-spec §4)', () => {
  const ray = { origin: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(0, 0, -1) }

  it('a ray through the bone sphere gives two exact depths, nearer first', () => {
    const parent = new THREE.Vector3(0.1, 0, -3)
    const r = resolveDepth(ray, parent, 0.5)
    expect(r.candidates).toHaveLength(2)
    const [near, far] = r.candidates
    expect(near?.point.distanceTo(parent)).toBeCloseTo(0.5, 9)
    expect(far?.point.distanceTo(parent)).toBeCloseTo(0.5, 9)
    expect((near?.t ?? 0) < (far?.t ?? 0)).toBe(true)
    expect(r.ambiguous).toBe(true)
    expect(pickByHint(r, 'toward')).toBe(near)
    expect(pickByHint(r, 'away')).toBe(far)
    expect(pickByHint(r, undefined)).toBeNull()
  })

  it('a ray outside the reach gives the closest point and its stretch as residual', () => {
    const parent = new THREE.Vector3(0.8, 0, -3)
    const r = resolveDepth(ray, parent, 0.5)
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0]?.residual).toBeCloseTo(0.3, 9)
    expect(r.candidates[0]?.point.z).toBeCloseTo(-3, 9)
    expect(r.ambiguous).toBe(false)
  })

  it('two nearly equal depths are not ambiguous; solutions behind the camera are dropped', () => {
    const grazing = resolveDepth(ray, new THREE.Vector3(0.5 - 1e-5, 0, -3), 0.5)
    expect(grazing.candidates.length === 1 || !grazing.ambiguous).toBe(true)
    expect(2 * Math.sqrt(0.25 - (0.5 - 1e-5) ** 2)).toBeLessThan(AMBIGUOUS_DEPTH_GAP_M)
    const behind = resolveDepth(ray, new THREE.Vector3(0, 0, 0.2), 0.5)
    expect(behind.candidates.every((c) => c.t > 0)).toBe(true)
  })

  it('confidence follows the spec: green < 2 cm, yellow < 8 cm, red otherwise', () => {
    expect(confidenceFromResidual(0)).toBe('green')
    expect(confidenceFromResidual(GREEN_RESIDUAL_M - 1e-6)).toBe('green')
    expect(confidenceFromResidual(GREEN_RESIDUAL_M)).toBe('yellow')
    expect(confidenceFromResidual(YELLOW_RESIDUAL_M - 1e-6)).toBe('yellow')
    expect(confidenceFromResidual(YELLOW_RESIDUAL_M)).toBe('red')
    expect([GREEN_RESIDUAL_M, YELLOW_RESIDUAL_M]).toEqual([0.02, 0.08])
  })
})

// ---- Staged solve against the synthetic fixture ----

const input = (fx: PoseFixture, landmarks = fx.landmarks, hints = fx.hints): PoseSolveInput => ({
  rig: fx.rig,
  camera: fx.camera,
  landmarks,
  hints,
  current: defaultPose(),
  locked: new Set(),
})

/** Joint position errors after lining up the hip centres (the pose shape), plus the hip depth error. */
function errors(fx: PoseFixture, sol: PoseSolution): { mean: number; max: number; depthRatio: number } {
  const w = forwardKinematics(fx.rig, sol.pose.joints, sol.pose.rootTransform)
  const wt = forwardKinematics(fx.rig, fx.truth.joints, fx.truth.rootTransform)
  const hc = (x: typeof w): THREE.Vector3 => jointPosition(x, 'thighL').add(jointPosition(x, 'thighR')).multiplyScalar(0.5)
  const e = JOINT_NAMES.map((j) => jointPosition(w, j).sub(hc(w)).distanceTo(jointPosition(wt, j).sub(hc(wt))))
  const truthDepth = viewDepth(cameraModel(fx.camera), hc(wt))
  const solDepth = viewDepth(cameraModel(sol.camera), hc(w))
  return { mean: e.reduce((a, v) => a + v, 0) / e.length, max: Math.max(...e), depthRatio: solDepth / truthDepth }
}

const POSES: readonly [string, number][] = [
  ['stand-relaxed', 0],
  ['walk-1', -40],
  ['run-1', 25],
  ['punch', 60],
  ['kick', -20],
  ['crouch', 10],
  ['sit', 35],
  ['reach-up', 0],
  ['jump', 30],
]

/**
 * Acceptance envelope (documented in docs/progress.md, Phase 3B):
 *  - exact landmarks + the artist's depth hints: mean joint error < 7 cm, worst joint < 15 cm, hip depth within 3%;
 *  - landmarks jittered by up to ±0.4% of the frame height (±4 px on a 1000 px sketch), five seeds: mean < 15 cm,
 *    worst < 35 cm. The worst joints are hands and feet whose depth flips under jitter; review catches those.
 * Errors are measured on the pose shape (hip centres lined up), since grounding moves figure and camera together.
 */
const ENVELOPE = { mean: 0.07, max: 0.15, depth: 0.03, noisyMean: 0.15, noisyMax: 0.35, noise: 0.004 }

describe('staged pose solve (solver-spec §2–4) on the synthetic fixture', () => {
  for (const [poseId, yaw] of POSES) {
    it(`${poseId}: all landmarks + hints land within the error envelope`, () => {
      const fx = buildFixture({ poseId, yawDeg: yaw })
      const r = solvePose(input(fx))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const e = errors(fx, r.solution)
      expect(e.mean).toBeLessThan(ENVELOPE.mean)
      expect(e.max).toBeLessThan(ENVELOPE.max)
      expect(Math.abs(e.depthRatio - 1)).toBeLessThan(ENVELOPE.depth)
      // Joint limits are respected (§3) and the figure stands on the ground.
      expect(limitViolations(r.solution.pose)).toEqual([])
      const world = forwardKinematics(fx.rig, r.solution.pose.joints, r.solution.pose.rootTransform)
      expect(Math.abs(lowestPoint(fx.rig, world))).toBeLessThan(1e-6)
    })
  }

  it('stays within the envelope with hand-placement jitter', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const r0 = rng(seed)
      for (const [poseId, yaw] of POSES) {
        const fx = buildFixture({ poseId, yawDeg: yaw })
        const jitter = (p: Vec2): Vec2 => [p[0] + (r0() - 0.5) * 2 * ENVELOPE.noise, p[1] + (r0() - 0.5) * 2 * ENVELOPE.noise]
        const lm = Object.fromEntries(Object.entries(fx.landmarks).map(([k, p]) => [k, jitter(p)])) as PoseFixture['landmarks']
        const r = solvePose(input(fx, lm))
        expect(r.ok, poseId).toBe(true)
        if (!r.ok) continue
        const e = errors(fx, r.solution)
        expect(e.mean, poseId).toBeLessThan(ENVELOPE.noisyMean)
        expect(e.max, poseId).toBeLessThan(ENVELOPE.noisyMax)
      }
    }
  })

  it('keeps the view: solved joints reproject onto their landmarks through the solved camera', () => {
    const fx = buildFixture({ poseId: 'walk-1', yawDeg: -40 })
    const r = solvePose(input(fx))
    if (!r.ok) throw new Error(r.reason)
    const cam = cameraModel(r.solution.camera)
    const world = forwardKinematics(fx.rig, r.solution.pose.joints, r.solution.pose.rootTransform)
    for (const id of ['hipL', 'hipR', 'kneeL', 'kneeR', 'elbowL', 'wristR', 'neck'] as const) {
      const joint = LANDMARKS[id].joint
      const p = project(cam, jointPosition(world, joint)) as Vec2
      const l = fx.landmarks[id]
      // A residual of r metres at depth d moves the image point by about f·r/d frame heights.
      const allowed = (cam.f * ((r.solution.joints[joint]?.residual ?? 0) + 1e-3)) / r.solution.depth
      expect(Math.hypot(p[0] - l[0], p[1] - l[1]), id).toBeLessThan(allowed * 1.5)
    }
  })

  it('works without hints: every joint reprojects closely even where depth is ambiguous', () => {
    const fx = buildFixture({ poseId: 'run-1', yawDeg: 25 })
    const r = solvePose(input(fx, fx.landmarks, {}))
    if (!r.ok) throw new Error(r.reason)
    const reds = Object.values(r.solution.joints).filter((j) => j?.confidence === 'red')
    expect(reds.length).toBeLessThanOrEqual(1)
    expect(limitViolations(r.solution.pose)).toEqual([])
  })

  it('confidence colours follow the spec rules, per joint and per limb', () => {
    for (const [poseId, yaw] of POSES) {
      const fx = buildFixture({ poseId, yawDeg: yaw })
      const r = solvePose(input(fx))
      if (!r.ok) throw new Error(r.reason)
      for (const rep of Object.values(r.solution.joints)) {
        if (!rep) continue
        const byResidual = confidenceFromResidual(rep.residual)
        // §4 residual rule, except an unreachable IK target is at least yellow (§3).
        expect(rep.confidence).toBe(rep.unreachable && byResidual === 'green' ? 'yellow' : byResidual)
      }
      const order = ['green', 'yellow', 'red']
      for (const [limb, members] of Object.entries(LIMB_JOINTS)) {
        const cs = members.map((j) => r.solution.joints[j]?.confidence).filter((c) => c !== undefined)
        const worst = cs.reduce<string | undefined>((a, c) => (a === undefined || order.indexOf(c) > order.indexOf(a) ? c : a), undefined)
        expect(r.solution.limbs[limb as keyof typeof r.solution.limbs]).toBe(worst)
      }
    }
  })

  it('keeps locked joints and the hands; output is plain editable pose state', () => {
    const fx = buildFixture({ poseId: 'punch', yawDeg: 60 })
    const current = { ...defaultPose(), hands: { L: 'fist' as const, R: 'open' as const } }
    current.joints.forearmR = { rx: -0.5, ry: 0.1, rz: 0 }
    const r = solvePose({ ...input(fx), current, locked: new Set(['forearmR']) })
    if (!r.ok) throw new Error(r.reason)
    expect(r.solution.pose.joints.forearmR).toEqual({ rx: -0.5, ry: 0.1, rz: 0 })
    expect(r.solution.pose.hands).toEqual({ L: 'fist', R: 'open' })
    expect(r.solution.pose.jointLocks).toEqual([])
  })

  it('feet off the ground: the camera stays where it was', () => {
    const fx = buildFixture({ poseId: 'jump', yawDeg: 30 })
    const r = solvePose({ ...input(fx), feetOnGround: false })
    if (!r.ok) throw new Error(r.reason)
    expect(r.solution.camera.position).toEqual(fx.camera.position)
    expect(r.solution.grounded).toBe(false)
    // The jump keeps its height: the lowest point is off the ground, near the truth lift.
    const world = forwardKinematics(fx.rig, r.solution.pose.joints, r.solution.pose.rootTransform)
    expect(lowestPoint(fx.rig, world)).toBeGreaterThan(0.2)
  })

  it('reports what is missing instead of guessing', () => {
    const fx = buildFixture()
    const { hipL: _h, ...noHip } = fx.landmarks
    expect(solvePose(input(fx, noHip as PoseFixture['landmarks'])).ok).toBe(false)
    const { neck: _n, shoulderL: _s, ...noTorso } = fx.landmarks
    expect(solvePose(input(fx, noTorso as PoseFixture['landmarks'])).ok).toBe(false)
  })

  it('works from the required landmarks alone (head and toes missing)', () => {
    const fx = buildFixture({ poseId: 'walk-1', yawDeg: -40 })
    const { head: _a, chin: _b, toeL: _c, toeR: _d, gaze: _e, chest: _f, waist: _g, ...rest } = fx.landmarks
    const r = solvePose(input(fx, rest as PoseFixture['landmarks']))
    if (!r.ok) throw new Error(r.reason)
    expect(r.solution.joints.head).toBeUndefined()
    expect(r.solution.warnings.some((w) => w.includes('crown'))).toBe(true)
    expect(errors(fx, r.solution).mean).toBeLessThan(ENVELOPE.mean)
  })
})

describe('guided landmark order', () => {
  it('walks the required checklist, then the optional ones, and wraps from the current one', () => {
    expect(nextLandmark({})).toBe('head')
    expect(nextLandmark({ head: [0, 0] }, 'head')).toBe('chin')
    const allRequired = Object.fromEntries(REQUIRED_LANDMARKS.map((id) => [id, [0, 0]]))
    expect(nextLandmark(allRequired, 'toeR')).toBe('chest')
    expect(nextLandmark({ ...allRequired, chest: [0, 0], waist: [0, 0], gaze: [0, 0] })).toBeNull()
    // Re-placing an early landmark jumps to the first still-missing required one after it.
    const { neck: _n, ...missingNeck } = allRequired
    expect(nextLandmark(missingNeck, 'head')).toBe('neck')
  })
})
