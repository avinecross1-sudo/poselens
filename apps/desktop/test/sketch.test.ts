import { describe, expect, it } from 'vitest'
import { fromSceneV1, toSceneV1 } from '../src/export/metadata'
import { degToRad, radToDeg } from '../src/lib/units'
import { snapshotDoc } from '../src/state/historySlice'
import { createAppStore, type AppStore } from '../src/state/store'
import type { SketchImage } from '../src/state/types'
import type { Vec2 } from '../src/types/scene'
import fixtureJson from './fixtures/synthetic-2pt.json'

const fixture = fixtureJson as unknown as {
  image: { width: number; height: number }
  truth: { pitchDeg: number; rollDeg: number; focalMm: number }
  cues: { horizon: [Vec2, Vec2]; vps: Vec2[] }
}
const image: SketchImage = { hash: 'sha256:fixture', name: 'synthetic-2pt.png', url: 'blob:test', width: fixture.image.width, height: fixture.image.height }

/** A store with the fixture sketch imported and its horizon + two VPs placed, as a user would. */
function storeWithCues(): AppStore {
  const store = createAppStore()
  store.getState().importSketch(image, 'C:/sketches/synthetic-2pt.png')
  store.getState().setHorizon(fixture.cues.horizon)
  fixture.cues.vps.forEach((p) => store.getState().addVp(p))
  return store
}

const sceneJson = (store: AppStore): Record<string, unknown> =>
  JSON.parse(JSON.stringify(toSceneV1(snapshotDoc(store.getState()), store.getState().exportSettings, '0.1.0'))) as Record<string, unknown>

describe('sketch import and cues', () => {
  it('import records hash, path and size, caches the image, and is one undo step', () => {
    const store = createAppStore()
    const before = snapshotDoc(store.getState())
    store.getState().importSketch(image, 'C:/a.png')
    const s = store.getState()
    expect(s.sketch).toMatchObject({ hash: image.hash, path: 'C:/a.png', size: { width: 1000, height: 1500 } })
    expect(s.sketchImages[image.hash]).toEqual(image)
    s.undo()
    expect(snapshotDoc(store.getState())).toEqual(before)
  })

  it('places a horizon and up to three VPs, each undoable', () => {
    const store = storeWithCues()
    store.getState().addVp([0, 0])
    store.getState().addVp([1, 1]) // a fourth is ignored
    expect(store.getState().sketch.vps).toHaveLength(3)
    store.getState().undo()
    expect(store.getState().sketch.vps).toHaveLength(2)
    store.getState().removeVp(0)
    expect(store.getState().sketch.vps).toEqual([fixture.cues.vps[1]])
  })

  it('dragging a cue is a single undo step', () => {
    const store = storeWithCues()
    const before = store.getState().sketch.vps[0]
    for (let i = 1; i <= 5; i++) store.getState().moveVp(0, [i, 0.4], { preview: true })
    store.getState().endGesture()
    expect(store.getState().sketch.vps[0]).toEqual([5, 0.4])
    store.getState().undo()
    expect(store.getState().sketch.vps[0]).toEqual(before)
  })

  it('a locked sketch ignores placement edits but cues stay editable', () => {
    const store = storeWithCues()
    store.getState().setSketchView({ locked: true })
    const align = store.getState().sketch.alignment
    store.getState().setSketchAlignment({ scale: 0.3 })
    store.getState().resetSketchAlignment()
    expect(store.getState().sketch.alignment).toEqual(align)
    store.getState().moveVp(0, [2, 0.5])
    expect(store.getState().sketch.vps[0]).toEqual([2, 0.5])
    store.getState().setSketchView({ locked: false })
    store.getState().setSketchAlignment({ scale: 0.3, rotation: degToRad(5), x: 0.1 })
    expect(store.getState().sketch.alignment).toEqual({ x: 0.1, y: 0, scale: 0.3, rotation: degToRad(5) })
  })

  it('clamps a collapsed scale', () => {
    const store = storeWithCues()
    store.getState().setSketchAlignment({ scale: 0 })
    expect(store.getState().sketch.alignment.scale).toBeGreaterThan(0)
  })
})

describe('camera solve action', () => {
  it('sets pitch, roll and focal from the cues', () => {
    const store = storeWithCues()
    const result = store.getState().solveCameraFromSketch()
    expect(result.ok).toBe(true)
    const c = store.getState().camera
    expect(c.focal).toBeCloseTo(fixture.truth.focalMm, 3)
    expect(radToDeg(c.roll)).toBeCloseTo(fixture.truth.rollDeg, 4)
    const pitch = Math.atan2(c.target[1] - c.position[1], Math.hypot(c.target[0] - c.position[0], c.target[2] - c.position[2]))
    expect(radToDeg(pitch)).toBeCloseTo(fixture.truth.pitchDeg, 4)
    expect(store.getState().sketch.solve.confidence['camera']).toBe('green')
    expect(store.getState().sketch.solve.baked).toBe(false)
  })

  it('undo restores the pre-solve camera exactly, redo re-applies it', () => {
    const store = storeWithCues()
    store.getState().setCameraYaw(0.4)
    store.getState().setCameraFocal(70)
    const preSolve = structuredClone(store.getState().camera)
    const preDoc = structuredClone(snapshotDoc(store.getState()))
    store.getState().solveCameraFromSketch()
    const solvedCamera = structuredClone(store.getState().camera)
    expect(solvedCamera).not.toEqual(preSolve)
    store.getState().undo()
    expect(store.getState().camera).toEqual(preSolve) // exact: same numbers, bit for bit
    expect(snapshotDoc(store.getState())).toEqual(preDoc)
    store.getState().redo()
    expect(store.getState().camera).toEqual(solvedCamera)
  })

  it('leaves the camera editable: nothing is locked and later edits work and undo', () => {
    const store = storeWithCues()
    store.getState().solveCameraFromSketch()
    const solvedFocal = store.getState().camera.focal
    store.getState().setCameraFocal(85)
    store.getState().setCameraRoll(0)
    store.getState().setCameraPitch(0.1)
    expect(store.getState().camera.focal).toBe(85)
    expect(store.getState().camera.roll).toBe(0)
    store.getState().undo()
    store.getState().undo()
    store.getState().undo()
    expect(store.getState().camera.focal).toBe(solvedFocal)
  })

  it('reports why it cannot solve and does not touch the camera', () => {
    const store = createAppStore()
    const before = structuredClone(store.getState().camera)
    expect(store.getState().solveCameraFromSketch().ok).toBe(false)
    store.getState().importSketch(image, null)
    const r = store.getState().solveCameraFromSketch()
    expect(r.ok).toBe(false)
    expect(store.getState().sketchMessage).toMatch(/horizon/i)
    expect(store.getState().camera).toEqual(before)
    expect(store.getState().history.past.map((c) => c.label)).toEqual(['Import sketch'])
  })

  it('moving a cue after a solve clears the stale solve record but keeps the camera', () => {
    const store = storeWithCues()
    store.getState().solveCameraFromSketch()
    const camera = structuredClone(store.getState().camera)
    store.getState().moveVp(0, [3, 0.4])
    expect(store.getState().sketch.solve.settings).toEqual({})
    expect(store.getState().camera).toEqual(camera)
  })

  it('warns on inconsistent VPs', () => {
    const store = createAppStore()
    store.getState().importSketch(image, null)
    store.getState().setHorizon(fixture.cues.horizon)
    // Both VPs on the same side of the frame centre cannot be orthogonal directions.
    store.getState().addVp([2.4, 0.3])
    store.getState().addVp([3.4, 0.3])
    const r = store.getState().solveCameraFromSketch()
    expect(r.ok && r.solution.confidence).toBe('red')
    expect(store.getState().sketch.solve.confidence['camera']).toBe('red')
    expect((store.getState().sketch.solve.settings['warnings'] as string[]).length).toBeGreaterThan(0)
  })
})

describe('sketch metadata', () => {
  it('round-trips the sketch, cues and solve through the scene file', () => {
    const store = storeWithCues()
    store.getState().setSketchAlignment({ scale: 0.4, x: 0.1, y: -0.05, rotation: 0.02 })
    store.getState().solveCameraFromSketch()
    const scene = toSceneV1(snapshotDoc(store.getState()), store.getState().exportSettings, '0.1.0')
    expect(scene.sketch.hash).toBe(image.hash)
    expect(scene.sketch.vps).toHaveLength(2)
    const loaded = fromSceneV1(JSON.parse(JSON.stringify(scene)))
    expect(loaded.doc.sketch).toEqual(snapshotDoc(store.getState()).sketch)
    expect(toSceneV1(loaded.doc, loaded.exportSettings, '0.1.0')).toEqual(scene)
  })

  it('loads scenes written before the sketch fields existed', () => {
    const scene = sceneJson(createAppStore())
    // A Phase 1/2 file: sketch is the old empty default without size.
    scene['sketch'] = {
      hash: null,
      path: null,
      alignment: { x: 0, y: 0, scale: 1, rotation: 0 },
      landmarks: {},
      horizon: null,
      vps: [],
      solve: { settings: {}, confidence: {}, baked: false },
    }
    const { doc } = fromSceneV1(scene)
    expect(doc.sketch.size).toBeNull()
    expect(doc.sketch.vps).toEqual([])
    delete scene['sketch']
    expect(fromSceneV1(scene).doc.sketch.hash).toBeNull()
  })

  it('ignores malformed cue data instead of failing', () => {
    const scene = sceneJson(createAppStore())
    scene['sketch'] = {
      hash: 7,
      horizon: [[0, 0]],
      vps: [[1, 2], ['x', 3], [4, 5, 6], [7, 8], [9, 9], [1, 1]],
      alignment: { scale: -2 },
      size: { width: 0, height: 5 },
    }
    const { doc } = fromSceneV1(scene)
    expect(doc.sketch.hash).toBeNull()
    expect(doc.sketch.horizon).toBeNull()
    expect(doc.sketch.vps).toEqual([[1, 2], [7, 8], [9, 9]])
    expect(doc.sketch.alignment.scale).toBe(1)
    expect(doc.sketch.size).toBeNull()
  })
})
