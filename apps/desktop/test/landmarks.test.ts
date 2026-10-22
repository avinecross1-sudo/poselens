import { describe, expect, it } from 'vitest'
import { fromSceneV1, toSceneV1 } from '../src/export/metadata'
import { frameToImage } from '../src/lib/sketchSpace'
import { forwardKinematics, lowestPoint } from '../src/solve/fk'
import { limitViolations } from '../src/solve/jointLimits'
import { LANDMARKS, type LandmarkId } from '../src/solve/landmarks'
import { snapshotDoc } from '../src/state/historySlice'
import { nextUncertain, uncertainJoints } from '../src/state/review'
import { rigOf } from '../src/state/rigOf'
import { createAppStore, type AppStore } from '../src/state/store'
import type { SketchImage } from '../src/state/types'
import type { SketchMeta, Vec2 } from '../src/types/scene'
import gestureJson from './fixtures/gesture-run.json'
import { buildFixture, FIXTURE_ASPECT } from './poseFixture'

const gesture = gestureJson as unknown as {
  image: { width: number; height: number }
  landmarksPx: Partial<Record<LandmarkId, Vec2>>
  depthHints: Partial<Record<LandmarkId, 'toward' | 'away'>>
}

/** A store with a sketch the size of the fixture frame (image = frame, so image and frame space line up 1:1). */
function storeWithSketch(width = 1000, height = 1500): AppStore {
  const store = createAppStore()
  const image: SketchImage = { hash: `sha256:${width}x${height}`, name: 'sketch.png', url: 'blob:test', width, height }
  store.getState().importSketch(image, 'C:/sketches/sketch.png')
  return store
}

/** The synthetic fixture's landmarks marked in a store, as a user would click them. */
function storeWithFixture(): { store: AppStore; fx: ReturnType<typeof buildFixture> } {
  const fx = buildFixture({ poseId: 'walk-1', yawDeg: -40 })
  const store = storeWithSketch()
  expect(store.getState().scene.canvasRatio).toBeCloseTo(FIXTURE_ASPECT, 12)
  store.getState().replaceDoc({ ...snapshotDoc(store.getState()), camera: fx.camera })
  const s = store.getState()
  const imageAspect = 1000 / 1500
  for (const [id, p] of Object.entries(fx.landmarks) as [LandmarkId, Vec2][]) {
    s.setLandmark(id, frameToImage(p, s.sketch.alignment, imageAspect, FIXTURE_ASPECT))
  }
  for (const [id, h] of Object.entries(fx.hints)) if (h) s.setDepthHint(id as LandmarkId, h)
  return { store, fx }
}

describe('landmark editing', () => {
  it('places, moves, hints and removes landmarks, each undoable; a drag is one step', () => {
    const store = storeWithSketch()
    const s = store.getState()
    s.setLandmark('hipL', [0.4, 0.6])
    s.setDepthHint('hipL', 'toward')
    for (let i = 1; i <= 4; i++) s.setLandmark('hipL', [0.4 + i * 0.01, 0.6], { preview: true })
    s.endGesture()
    expect(store.getState().sketch.landmarks['hipL']).toEqual([0.44, 0.6])
    store.getState().undo()
    expect(store.getState().sketch.landmarks['hipL']).toEqual([0.4, 0.6])
    store.getState().removeLandmark('hipL')
    expect(store.getState().sketch.landmarks['hipL']).toBeUndefined()
    expect(store.getState().sketch.depthHints['hipL']).toBeUndefined()
    store.getState().undo()
    expect(store.getState().sketch.depthHints['hipL']).toBe('toward')
  })

  it('arming a landmark arms the landmark tool; Esc-style disarm clears it', () => {
    const store = storeWithSketch()
    store.getState().setActiveLandmark('neck')
    expect(store.getState().cueTool).toBe('landmark')
    store.getState().setCueTool('none')
    expect(store.getState().activeLandmark).toBeNull()
  })

  it('every landmark names a mannequin node', () => {
    const rig = rigOf(createAppStore().getState().body)
    for (const def of Object.values(LANDMARKS)) expect(rig[def.joint]).toBeDefined()
  })
})

describe('solve pose from sketch (store)', () => {
  it('is one undo step; undo restores the pre-solve document exactly, redo re-applies it', () => {
    const { store } = storeWithFixture()
    const before = snapshotDoc(store.getState())
    const pastLen = store.getState().history.past.length
    const r = store.getState().solvePoseFromSketch()
    expect(r.ok).toBe(true)
    const after = snapshotDoc(store.getState())
    expect(store.getState().history.past.length).toBe(pastLen + 1)
    expect(store.getState().history.past.at(-1)?.label).toBe('Solve pose from sketch')
    store.getState().undo()
    expect(snapshotDoc(store.getState())).toEqual(before)
    store.getState().redo()
    expect(snapshotDoc(store.getState())).toEqual(after)
  })

  it('writes an editable pose, the camera and a confidence record; nothing is locked', () => {
    const { store } = storeWithFixture()
    store.getState().solvePoseFromSketch()
    const s = store.getState()
    expect(s.pose.jointLocks).toEqual([])
    expect(s.pose.ikLocks).toEqual([])
    expect(limitViolations(s.pose)).toEqual([])
    expect(s.sketch.solve.confidence['forearmL']).toMatch(/green|yellow|red/)
    expect(s.sketch.solve.confidence['armL']).toMatch(/green|yellow|red/)
    expect(s.sketch.solve.baked).toBe(false)
    const rec = s.sketch.solve.settings['pose'] as Record<string, unknown>
    expect(rec['grounded']).toBe(true)
    // Ordinary edits keep working, as separate undo steps.
    const elbow = s.pose.joints.forearmL
    s.setJointRotation('forearmL', { ...elbow, rx: elbow.rx - 0.1 })
    expect(store.getState().pose.joints.forearmL.rx).toBeCloseTo(elbow.rx - 0.1, 12)
    store.getState().undo()
    expect(store.getState().pose.joints.forearmL).toEqual(elbow)
    // Grounded: the lowest body point is on the ground.
    const rig = rigOf(s.body)
    expect(Math.abs(lowestPoint(rig, forwardKinematics(rig, s.pose.joints, s.pose.rootTransform)))).toBeLessThan(1e-6)
  })

  it('also solves the camera from unsolved cues, inside the same undo step', () => {
    const { store } = storeWithFixture()
    store.getState().setHorizon([
      [0, 0.45],
      [1, 0.47],
    ])
    const before = snapshotDoc(store.getState())
    store.getState().solvePoseFromSketch()
    const s = store.getState()
    expect(s.sketch.solve.confidence['camera']).toBeDefined()
    expect((s.sketch.solve.settings['pose'] as Record<string, unknown>)['cameraSolved']).toBe(true)
    expect(s.camera.roll).not.toBe(before.camera.roll)
    s.undo()
    expect(snapshotDoc(store.getState())).toEqual(before)
  })

  it('moving a landmark makes the pose solve stale but keeps the camera solve', () => {
    const { store } = storeWithFixture()
    store.getState().setHorizon([
      [0, 0.45],
      [1, 0.47],
    ])
    store.getState().solvePoseFromSketch()
    store.getState().setLandmark('wristL', [0.5, 0.5])
    const solve = store.getState().sketch.solve
    expect(solve.settings['pose']).toBeUndefined()
    expect(solve.confidence['forearmL']).toBeUndefined()
    expect(solve.confidence['camera']).toBeDefined()
  })

  it('reports a missing requirement without touching the document', () => {
    const store = storeWithSketch()
    store.getState().setLandmark('hipL', [0.4, 0.6])
    const before = snapshotDoc(store.getState())
    const r = store.getState().solvePoseFromSketch()
    expect(r.ok).toBe(false)
    expect(store.getState().sketchMessage).toMatch(/hips/)
    expect(snapshotDoc(store.getState())).toEqual(before)
  })

  it('landmarks, depth hints and the solve record survive a save / load round trip', () => {
    const { store } = storeWithFixture()
    store.getState().solvePoseFromSketch()
    const doc = snapshotDoc(store.getState())
    const json = JSON.parse(JSON.stringify(toSceneV1(doc, store.getState().exportSettings, '0.1.0'))) as unknown
    const back = fromSceneV1(json).doc
    expect(back.sketch).toEqual(doc.sketch)
    expect(back.pose).toEqual(doc.pose)
    // Older files without depthHints load with none.
    const old = JSON.parse(JSON.stringify(json)) as { sketch: Partial<SketchMeta> }
    delete old.sketch.depthHints
    expect(fromSceneV1(old).doc.sketch.depthHints).toEqual({})
  })
})

describe('next uncertain joint', () => {
  const sketchWith = (confidence: Record<string, 'green' | 'yellow' | 'red'>, pose: Record<string, unknown>): SketchMeta => ({
    ...createAppStore().getState().sketch,
    solve: { settings: { pose }, confidence, baked: false },
  })

  it('lists red, then yellow, then ambiguous greens, worst residual first, and cycles', () => {
    const sk = sketchWith(
      { forearmL: 'yellow', handL: 'red', shinR: 'green', thighL: 'green', footR: 'yellow', armL: 'red', camera: 'green' },
      { residualsCm: { forearmL: 3, handL: 9, footR: 6, shinR: 1, thighL: 0.5 }, ambiguous: ['shinR'] },
    )
    const list = uncertainJoints(sk)
    expect(list.map((u) => u.joint)).toEqual(['handL', 'footR', 'forearmL', 'shinR'])
    expect(nextUncertain(list, null)?.joint).toBe('handL')
    expect(nextUncertain(list, 'handL')?.joint).toBe('footR')
    expect(nextUncertain(list, 'shinR')?.joint).toBe('handL')
    expect(nextUncertain([], null)).toBeNull()
  })

  it('selecting through the list after a real solve visits only flagged joints', () => {
    const { store } = storeWithFixture()
    store.getState().setDepthHint('elbowL', null)
    store.getState().setDepthHint('wristL', null)
    store.getState().solvePoseFromSketch()
    const list = uncertainJoints(store.getState().sketch)
    for (const u of list) {
      const c = store.getState().sketch.solve.confidence[u.joint]
      expect(c !== 'green' || u.ambiguous).toBe(true)
    }
  })
})

describe("Tram's gesture sketch (test/fixtures/gesture-run.jpg)", () => {
  /**
   * Real drawings do not fit a rigid mannequin exactly, so the envelope here is about the drawing, not a truth pose:
   * the solve succeeds, stays inside joint limits, stands on the ground, and most marked joints land within 8 cm
   * (green or yellow) of their landmark rays, with the median under 3 cm.
   */
  it('solves to a starting pose inside the documented envelope', () => {
    const store = storeWithSketch(gesture.image.width, gesture.image.height)
    const s = store.getState()
    for (const [id, px] of Object.entries(gesture.landmarksPx) as [LandmarkId, Vec2][]) {
      s.setLandmark(id, [px[0] / gesture.image.width, px[1] / gesture.image.height])
    }
    for (const [id, h] of Object.entries(gesture.depthHints)) if (h) s.setDepthHint(id as LandmarkId, h)
    const r = store.getState().solvePoseFromSketch()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const reports = Object.values(r.solution.joints).filter((j) => j !== undefined)
    const residuals = reports.map((j) => j.residual).sort((a, b) => a - b)
    const within = reports.filter((j) => j.confidence !== 'red').length / reports.length
    expect(within).toBeGreaterThanOrEqual(0.8)
    expect(residuals[Math.floor(residuals.length / 2)]).toBeLessThan(0.03)
    const st = store.getState()
    expect(limitViolations(st.pose)).toEqual([])
    const rig = rigOf(st.body)
    expect(Math.abs(lowestPoint(rig, forwardKinematics(rig, st.pose.joints, st.pose.rootTransform)))).toBeLessThan(1e-6)
    // No head was drawn: the solve says so instead of inventing one.
    expect(r.solution.warnings.some((w) => w.includes('crown'))).toBe(true)
  })
})
