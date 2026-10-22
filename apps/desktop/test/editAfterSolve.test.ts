// Phase 3C: edit after solve — partial limb re-solve (solver-spec §5), depth nudges, camera diagnostics, bake.
import { describe, expect, it } from 'vitest'
import { fromSceneV1, toSceneV1 } from '../src/export/metadata'
import { frameToImage } from '../src/lib/sketchSpace'
import { cameraDiagnostics, RED_JOINTS_WARN } from '../src/solve/cameraDiagnostics'
import { applyNudges, isNudgeJoint, NUDGE_JOINTS, nudgeDepth, nudgeLimb, swingAngle } from '../src/solve/depthNudge'
import { forwardKinematics, jointPosition } from '../src/solve/fk'
import { limitViolations } from '../src/solve/jointLimits'
import type { LandmarkId } from '../src/solve/landmarks'
import { PART_JOINTS, partOf, resolvePart, scorePose, SOLVE_PARTS, solvePose, type PoseSolveInput } from '../src/solve/poseSolve'
import { cameraModel, distanceToRay, rayThrough, viewDepth } from '../src/solve/projection'
import { defaultSketch } from '../src/state/defaults'
import { snapshotDoc } from '../src/state/historySlice'
import { rigOf } from '../src/state/rigOf'
import { createAppStore, type AppStore } from '../src/state/store'
import type { SketchImage } from '../src/state/types'
import { JOINT_NAMES, type CameraState, type JointName, type SketchMeta, type Vec2 } from '../src/types/scene'
import { buildFixture, FIXTURE_ASPECT, type PoseFixture } from './poseFixture'

const IMAGE_W = 1000
const IMAGE_H = 1500

/** The fixture's landmarks and hints marked in a store (image = frame, as in landmarks.test.ts), then solved. */
function solvedStore(fx: PoseFixture = buildFixture({ poseId: 'walk-1', yawDeg: -40 })): { store: AppStore; fx: PoseFixture } {
  const store = createAppStore()
  const image: SketchImage = { hash: 'sha256:fixture', name: 'sketch.png', url: 'blob:test', width: IMAGE_W, height: IMAGE_H }
  store.getState().importSketch(image, 'C:/sketches/sketch.png')
  store.getState().replaceDoc({ ...snapshotDoc(store.getState()), camera: fx.camera })
  const s = store.getState()
  for (const [id, p] of Object.entries(fx.landmarks) as [LandmarkId, Vec2][]) {
    s.setLandmark(id, frameToImage(p, s.sketch.alignment, IMAGE_W / IMAGE_H, FIXTURE_ASPECT))
  }
  for (const [id, h] of Object.entries(fx.hints)) if (h) s.setDepthHint(id as LandmarkId, h)
  // Through the drawing camera with the lens known (as if two VPs had fixed it), so the test is about editing.
  const r = solvePoseFixedLens(store)
  expect(r).toBe(true)
  return { store, fx }
}

function solvePoseFixedLens(store: AppStore): boolean {
  // The store solves the lens from the figure when no VPs fix it; mark it fixed the way a camera solve would.
  const s = store.getState()
  store.getState().replaceDoc({
    ...snapshotDoc(s),
    sketch: { ...s.sketch, solve: { settings: { focalSolved: true, focalMm: s.camera.focal }, confidence: { camera: 'green' }, baked: false } },
  })
  return store.getState().solvePoseFromSketch().ok
}

const solverInput = (fx: PoseFixture, current = buildFixture().truth, camera: CameraState = fx.camera): PoseSolveInput => ({
  rig: fx.rig,
  camera,
  landmarks: fx.landmarks,
  hints: fx.hints,
  current,
  locked: new Set(),
})

const outside = (part: (typeof SOLVE_PARTS)[number]): JointName[] => JOINT_NAMES.filter((j) => !PART_JOINTS[part].includes(j))

describe('partial limb re-solve (solver-spec §5)', () => {
  it('every joint belongs to exactly one part', () => {
    for (const j of JOINT_NAMES) expect(SOLVE_PARTS.filter((p) => PART_JOINTS[p].includes(j))).toEqual([partOf(j)])
  })

  it('re-solving one part leaves every other joint, the root and the camera exactly as they were (each part)', () => {
    const fx = buildFixture({ poseId: 'walk-1', yawDeg: -40 })
    const solved = solvePose({ ...solverInput(fx), current: fx.truth })
    if (!solved.ok) throw new Error(solved.reason)
    const pose = solved.solution.pose
    const camera = solved.solution.camera
    for (const part of SOLVE_PARTS) {
      const r = resolvePart({ ...solverInput(fx, pose, camera) }, part)
      if (!r.ok) throw new Error(r.reason)
      for (const j of outside(part)) expect(r.solution.pose.joints[j]).toEqual(pose.joints[j])
      expect(r.solution.pose.rootTransform).toEqual(pose.rootTransform)
      expect(r.solution.camera).toEqual(camera)
      expect(limitViolations(r.solution.pose)).toEqual([])
    }
  })

  it('re-solving a disturbed arm brings it back onto the drawing', () => {
    const fx = buildFixture({ poseId: 'walk-1', yawDeg: -40 })
    const solved = solvePose({ ...solverInput(fx), current: fx.truth })
    if (!solved.ok) throw new Error(solved.reason)
    const sol = solved.solution
    const disturbed = { ...sol.pose, joints: { ...sol.pose.joints, upperArmL: { rx: sol.pose.joints.upperArmL.rx + 0.6, ry: 0.3, rz: -0.2 } } }
    const offBefore = scorePose(fx.rig, disturbed, sol.camera, fx.landmarks).joints.forearmL?.residual ?? 0
    expect(offBefore).toBeGreaterThan(0.05)
    const r = resolvePart(solverInput(fx, disturbed, sol.camera), 'armL')
    if (!r.ok) throw new Error(r.reason)
    expect(r.solution.joints.forearmL?.residual).toBeLessThan(0.02)
    expect(r.solution.joints.handL?.residual).toBeLessThan(0.02)
  })

  it('needs the limb landmarks', () => {
    const fx = buildFixture()
    const { elbowR: _e, wristR: _w, ...landmarks } = fx.landmarks
    const r = resolvePart({ ...solverInput(fx, fx.truth), landmarks }, 'armR')
    expect(r.ok).toBe(false)
  })
})

describe('partial re-solve (store)', () => {
  it('re-solving the left arm leaves all other limbs deep-equal, keeps locked joints, and is one undo step', () => {
    const { store } = solvedStore()
    const s0 = store.getState()
    // Disturb the arm by hand, lock the hand, then re-solve the arm.
    s0.setJointRotation('upperArmL', { rx: s0.pose.joints.upperArmL.rx + 0.5, ry: 0.2, rz: 0 })
    store.getState().toggleJointLock('handL')
    const before = snapshotDoc(store.getState())
    const pastLen = store.getState().history.past.length
    const r = store.getState().resolvePart('armL')
    expect(r.ok).toBe(true)
    const after = store.getState()
    for (const j of outside('armL')) expect(after.pose.joints[j]).toEqual(before.pose.joints[j])
    expect(after.pose.joints.handL).toEqual(before.pose.joints.handL)
    expect(after.pose.rootTransform).toEqual(before.pose.rootTransform)
    expect(after.pose.hands).toEqual(before.pose.hands)
    expect(after.camera).toEqual(before.camera)
    expect(after.pose.joints.upperArmL).not.toEqual(before.pose.joints.upperArmL)
    expect(after.sketch.solve.confidence['forearmL']).toBe('green')
    expect((after.sketch.solve.settings['pose'] as Record<string, unknown>)['resolvedParts']).toEqual(['armL'])
    // One undo step, tagged as a solve.
    expect(after.history.past.length).toBe(pastLen + 1)
    expect(after.history.past.at(-1)?.solve).toBe(true)
    store.getState().undo()
    expect(snapshotDoc(store.getState())).toEqual(before)
  })

  it('asks for a full solve first', () => {
    const store = createAppStore()
    const r = store.getState().resolvePart('legL')
    expect(r.ok).toBe(false)
    expect(store.getState().sketchMessage).toMatch(/Solve the whole pose first/)
  })
})

describe('depth nudge', () => {
  const fx = buildFixture({ poseId: 'walk-1', yawDeg: -40 })
  const cam = cameraModel(fx.camera)
  const at = (joints: typeof fx.truth.joints, j: JointName) => jointPosition(forwardKinematics(fx.rig, joints, fx.truth.rootTransform), j)
  const base = { rig: fx.rig, joints: fx.truth.joints, root: fx.truth.rootTransform, camera: fx.camera, locked: new Set<JointName>() }

  it('swingAngle solves A cos θ + B sin θ = delta + A, smallest turn, clamped past reach', () => {
    for (const [a, b, d] of [[0.1, 0.05, 0.01], [-0.08, 0.1, -0.03], [0.02, -0.12, 0.1]] as const) {
      const t = swingAngle(a, b, d)
      expect(a * (Math.cos(t) - 1) + b * Math.sin(t)).toBeCloseTo(d, 9)
    }
    // Out of reach: the extreme of the circle.
    const t = swingAngle(0, 0.1, 0.5)
    expect(Math.sin(t)).toBeCloseTo(1, 9)
    expect(swingAngle(0, 0, 0.1)).toBe(0)
  })

  it('an elbow nudge changes its depth by the asked amount and leaves the wrist where it was', () => {
    // A bent elbow: the swing about the shoulder–wrist line reaches the depth on its own.
    const bent = buildFixture({ poseId: 'walk-1', yawDeg: -40, joints: { forearmL: { rx: -1.4, ry: 0, rz: 0 } } })
    const atBent = (joints: typeof bent.truth.joints, j: JointName) => jointPosition(forwardKinematics(bent.rig, joints, bent.truth.rootTransform), j)
    for (const delta of [0.04, -0.04]) {
      const r = nudgeDepth({ ...base, joints: bent.truth.joints, root: bent.truth.rootTransform, joint: 'forearmL', delta })
      expect(r.moved).toBeCloseTo(delta, 4)
      expect(viewDepth(cam, atBent(r.joints, 'forearmL')) - viewDepth(cam, atBent(bent.truth.joints, 'forearmL'))).toBeCloseTo(delta, 4)
      expect(atBent(r.joints, 'handL').distanceTo(atBent(bent.truth.joints, 'handL'))).toBeLessThan(1e-6)
      // Only the upper arm turned.
      for (const j of JOINT_NAMES) if (j !== 'upperArmL') expect(r.joints[j]).toEqual(bent.truth.joints[j])
    }
  })

  it('a nearly straight elbow still reaches the asked depth by tipping the upper arm', () => {
    for (const delta of [0.04, -0.04]) {
      const r = nudgeDepth({ ...base, joint: 'forearmL', delta })
      expect(r.moved).toBeCloseTo(delta, 3)
      expect(viewDepth(cam, at(r.joints, 'forearmL')) - viewDepth(cam, at(fx.truth.joints, 'forearmL'))).toBeCloseTo(r.moved, 9)
      for (const j of JOINT_NAMES) if (j !== 'upperArmL') expect(r.joints[j]).toEqual(fx.truth.joints[j])
    }
  })

  it('a wrist or ankle nudge slides the joint along its own ray (it stays on the drawing)', () => {
    for (const joint of ['handR', 'footL'] as const) {
      const r = nudgeDepth({ ...base, joint, delta: 0.05 })
      expect(Math.abs(r.moved)).toBeGreaterThan(0.03)
      const ray = rayThrough(cam, fx.landmarks[joint === 'handR' ? 'wristR' : 'ankleL'])
      expect(distanceToRay(ray, at(r.joints, joint))).toBeLessThan(0.006)
      expect(limitViolations({ ...fx.truth, joints: r.joints })).toEqual([])
    }
  })

  it('a head nudge turns only the neck', () => {
    const r = nudgeDepth({ ...base, joint: 'head', delta: -0.03 })
    expect(r.moved).toBeLessThan(-0.01)
    for (const j of JOINT_NAMES) if (j !== 'neck') expect(r.joints[j]).toEqual(fx.truth.joints[j])
  })

  it('is refused for a locked joint or a locked mover', () => {
    expect(nudgeDepth({ ...base, joint: 'forearmL', delta: 0.05, locked: new Set(['upperArmL']) }).moved).toBe(0)
    expect(nudgeDepth({ ...base, joint: 'handL', delta: 0.05, locked: new Set(['handL']) }).moved).toBe(0)
  })

  it('nudge joints and their ghost limbs', () => {
    for (const j of NUDGE_JOINTS) {
      expect(isNudgeJoint(j)).toBe(true)
      expect(nudgeLimb(j)).toContain(j)
    }
    expect(isNudgeJoint('hips')).toBe(false)
  })

  it('in the store: changes depth, records the nudge and re-scores confidence; one undo restores', () => {
    const { store } = solvedStore()
    const s0 = store.getState()
    const rig = rigOf(s0.body)
    const camModel = cameraModel(s0.camera)
    const elbowDepth = (): number => viewDepth(camModel, jointPosition(forwardKinematics(rig, store.getState().pose.joints, store.getState().pose.rootTransform), 'forearmL'))
    const residual = (): number => ((store.getState().sketch.solve.settings['pose'] as Record<string, Record<string, number>>)['residualsCm'] ?? {})['forearmL'] ?? NaN
    const d0 = elbowDepth()
    const r0 = residual()
    const c0 = store.getState().sketch.solve.confidence['forearmL']
    expect(c0).toBe('green')
    const before = snapshotDoc(store.getState())
    const moved = store.getState().nudgeJointDepth('forearmL', 0.12)
    expect(moved).toBeGreaterThan(0.05)
    expect(elbowDepth() - d0).toBeCloseTo(moved, 6)
    expect(store.getState().pose.depthNudges['forearmL']).toBeCloseTo(moved, 9)
    // Pushing the elbow off the depth the drawing supports shows in the confidence.
    expect(residual()).toBeGreaterThan(r0 + 1)
    expect(store.getState().sketch.solve.confidence['forearmL']).not.toBe('green')
    expect(store.getState().sketch.solve.confidence['camera']).toBe('green')
    store.getState().undo()
    expect(snapshotDoc(store.getState())).toEqual(before)
  })

  it('a handle drag is one undo step; clearing a nudge takes it back out', () => {
    const { store } = solvedStore()
    const before = snapshotDoc(store.getState())
    for (let i = 0; i < 5; i++) store.getState().nudgeJointDepth('forearmR', 0.01, { preview: true })
    store.getState().endGesture()
    expect(store.getState().pose.depthNudges['forearmR']).toBeCloseTo(0.05, 3)
    store.getState().undo()
    expect(snapshotDoc(store.getState())).toEqual(before)
    store.getState().redo()
    store.getState().clearDepthNudge('forearmR')
    expect(store.getState().pose.depthNudges['forearmR']).toBeUndefined()
    // The joints go back where they were (the nudge is reversed geometrically, not replayed from history).
    const rig = rigOf(before.body)
    const now = forwardKinematics(rig, store.getState().pose.joints, before.pose.rootTransform)
    const was = forwardKinematics(rig, before.pose.joints, before.pose.rootTransform)
    for (const j of JOINT_NAMES) expect(jointPosition(now, j).distanceTo(jointPosition(was, j))).toBeLessThan(0.005)
  })

  it('recorded nudges are re-applied by a re-solve of their limb', () => {
    const { store } = solvedStore()
    const s = store.getState()
    const rig = rigOf(s.body)
    const depth = (): number =>
      viewDepth(cameraModel(store.getState().camera), jointPosition(forwardKinematics(rig, store.getState().pose.joints, store.getState().pose.rootTransform), 'forearmL'))
    const plain = depth()
    const moved = s.nudgeJointDepth('forearmL', 0.06)
    store.getState().resolvePart('armL')
    expect(depth() - plain).toBeCloseTo(moved, 2)
    expect(store.getState().pose.depthNudges['forearmL']).toBeCloseTo(moved, 9)
  })

  it('applyNudges replays only the joints asked for', () => {
    const joints = applyNudges(base, { forearmL: 0.04, handR: 0.05 }, new Set(['forearmL']))
    expect(joints.upperArmR).toEqual(fx.truth.joints.upperArmR)
    expect(joints.upperArmL).not.toEqual(fx.truth.joints.upperArmL)
  })
})

describe('bake solve to manual pose', () => {
  it('keeps the pose and camera, clears the solve status and removes the solve from the history', () => {
    const { store } = solvedStore()
    store.getState().nudgeJointDepth('forearmL', 0.03)
    const e = store.getState().pose.joints.forearmR
    store.getState().setJointRotation('forearmR', { ...e, rx: e.rx - 0.1 })
    const before = store.getState()
    const pose = before.pose
    expect(before.history.past.some((c) => c.solve)).toBe(true)
    expect(store.getState().bakeSolve()).toBe(true)
    const s = store.getState()
    expect(s.pose.joints).toEqual(pose.joints)
    expect(s.pose.rootTransform).toEqual(pose.rootTransform)
    expect(s.pose.depthNudges).toEqual({})
    expect(s.camera).toEqual(before.camera)
    expect(s.sketch.solve).toEqual({ settings: {}, confidence: {}, baked: true })
    expect(s.sketch.landmarks).toEqual(before.sketch.landmarks)
    expect(s.history.past.some((c) => c.solve)).toBe(false)
    // Later edits are still undoable, and undoing them does not bring the solve back.
    expect(s.history.past.at(-1)?.label).toBe('Rotate forearmR')
    store.getState().undo()
    expect(store.getState().pose.joints.forearmR).toEqual(e)
    expect(store.getState().sketch.solve).toEqual({ settings: {}, confidence: {}, baked: true })
    while (store.getState().history.past.length) store.getState().undo()
    expect(store.getState().sketch.solve.baked).toBe(true)
    expect(store.getState().sketch.solve.confidence).toEqual({})
  })

  it('does nothing before a solve; a later solve starts a fresh, un-baked record', () => {
    const store = createAppStore()
    expect(store.getState().bakeSolve()).toBe(false)
    const { store: solved } = solvedStore()
    solved.getState().bakeSolve()
    expect(solved.getState().resolvePart('armL').ok).toBe(false)
    expect(solved.getState().solvePoseFromSketch().ok).toBe(true)
    expect(solved.getState().sketch.solve.baked).toBe(false)
  })
})

describe('camera diagnostics', () => {
  const camera: CameraState = { position: [0, 1.5, 4], target: [0, 1.5, 0], up: [0, 1, 0], focal: 35, sensorHeight: 24, roll: 0, preset: 'custom' }
  const sketch = (settings: Record<string, unknown>, confidence: SketchMeta['solve']['confidence'] = { camera: 'green' }): SketchMeta => ({
    ...defaultSketch(),
    solve: { settings, confidence, baked: false },
  })
  const vpSolve = { pitch: 0, roll: 0, focalMm: 35, focalRangeMm: [33, 37], pitchRange: [0, 0], focalSolved: true, horizonSource: 'placed', warnings: [] }

  it('nothing solved: nothing to report', () => {
    expect(cameraDiagnostics(defaultSketch(), camera).confidence).toBeNull()
  })

  it('two VPs: the solved range, green while the camera matches', () => {
    const d = cameraDiagnostics(sketch(vpSolve), camera)
    expect(d.focalSource).toBe('vps')
    expect(d.focalRangeMm).toEqual([33, 37])
    expect(d.confidence).toBe('green')
    expect(d.consistency).toEqual([])
  })

  it('flags a focal outside the range, a tilt and a roll made after the solve', () => {
    const d = cameraDiagnostics(sketch(vpSolve), { ...camera, focal: 50, target: [0, 1.2, 0], roll: 0.1 })
    expect(d.confidence).toBe('yellow')
    expect(d.consistency.join(' ')).toMatch(/outside the range/)
    expect(d.consistency.join(' ')).toMatch(/tilted/)
    expect(d.consistency.join(' ')).toMatch(/rolled/)
  })

  it('one VP: a suggested range; carries the cue warnings and their confidence', () => {
    const d = cameraDiagnostics(sketch({ ...vpSolve, focalSolved: false, focalRangeMm: [24, 135], warnings: ['VP 1 is off the horizon.'] }, { camera: 'yellow' }), camera)
    expect(d.focalSource).toBe('suggested')
    expect(d.focalRangeMm).toEqual([24, 135])
    expect(d.cueWarnings).toEqual(['VP 1 is off the horizon.'])
    expect(d.confidence).toBe('yellow')
  })

  it('a lens from the figure that disagrees with the cues, and many red joints, are inconsistencies', () => {
    const residualsCm = Object.fromEntries(['forearmL', 'handL', 'shinL', 'footL'].map((j) => [j, 12]))
    const pose = { focalSolved: true, focalMm: 14, residualsCm }
    const d = cameraDiagnostics(sketch({ ...vpSolve, focalSolved: false, focalRangeMm: [24, 135], pose }, { camera: 'yellow' }), { ...camera, focal: 14 })
    expect(d.focalSource).toBe('figure')
    expect(d.focalMm).toBe(14)
    expect(d.consistency.join(' ')).toMatch(/disagrees with the cues/)
    expect(d.consistency.join(' ')).toMatch(new RegExp(`${Object.keys(residualsCm).length} joints`))
    expect(Object.keys(residualsCm).length).toBeGreaterThanOrEqual(RED_JOINTS_WARN)
  })

  it('a pose solve alone (no cues) reports the lens it used', () => {
    const d = cameraDiagnostics(sketch({ pose: { focalSolved: true, focalMm: 20, residualsCm: {} } }, { forearmL: 'green' }), { ...camera, focal: 20 })
    expect(d.focalSource).toBe('figure')
    expect(d.pitch).toBeNull()
    expect(d.confidence).toBe('green')
  })
})

describe('compare mode and trace lock', () => {
  it('trace lock freezes the shot camera and the sketch placement, and shows the shot view', () => {
    const { store } = solvedStore()
    const cam = store.getState().camera
    const align = store.getState().sketch.alignment
    store.getState().setSketchView({ traceLock: true, compare: true, difference: true })
    expect(store.getState().activeCamera).toBe('shot')
    store.getState().setCameraFocal(85)
    store.getState().setCameraYaw(1)
    store.getState().resetCamera()
    store.getState().setSketchAlignment({ x: 0.3 })
    expect(store.getState().camera).toEqual(cam)
    expect(store.getState().sketch.alignment).toEqual(align)
    // Posing still works.
    const e = store.getState().pose.joints.forearmL
    store.getState().setJointRotation('forearmL', { ...e, rx: e.rx - 0.1 })
    expect(store.getState().pose.joints.forearmL.rx).toBeCloseTo(e.rx - 0.1, 12)
    store.getState().setSketchView({ traceLock: false })
    store.getState().setCameraFocal(85)
    expect(store.getState().camera.focal).toBe(85)
  })
})

describe('metadata round-trip with Phase 3C fields', () => {
  it('depth nudges, re-solved parts and the baked flag survive save and load', () => {
    const { store } = solvedStore()
    store.getState().nudgeJointDepth('forearmL', 0.03)
    store.getState().resolvePart('legR')
    const doc = snapshotDoc(store.getState())
    const exp = store.getState().exportSettings
    const back = fromSceneV1(JSON.parse(JSON.stringify(toSceneV1(doc, exp, '0.1.0')))).doc
    expect(back).toEqual(doc)
    expect(Object.keys(back.pose.depthNudges)).toEqual(['forearmL'])
    store.getState().bakeSolve()
    const baked = snapshotDoc(store.getState())
    expect(fromSceneV1(JSON.parse(JSON.stringify(toSceneV1(baked, exp, '0.1.0')))).doc).toEqual(baked)
  })
})
