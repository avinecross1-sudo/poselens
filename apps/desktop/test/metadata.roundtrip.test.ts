import { describe, expect, it } from 'vitest'
import { fromSceneV1, migrate, SceneFormatError, toSceneV1 } from '../src/export/metadata'
import { snapshotDoc } from '../src/state/historySlice'
import { createAppStore, type AppStore } from '../src/state/store'
import { SCHEMA_VERSION, type SceneV1 } from '../src/types/scene'

const VERSION = '0.1.0'

function editedStore(): AppStore {
  const store = createAppStore()
  const s = store.getState()
  s.applyPreset('heroic')
  s.setBodySlider('mass', 0.73)
  s.setJointRotation('upperArmL', { rx: 0.1, ry: -0.25, rz: 1.2 })
  s.setJointRotation('thighR', { rx: -0.6, ry: 0, rz: 0.05 })
  s.setRootTransform({ position: [0.3, 0, -0.2], rotation: [0, 0.8, 0] })
  s.setCameraFocal(35)
  s.setCameraYaw(0.7)
  s.setCameraPitch(-0.3)
  s.setCameraRoll(0.12)
  s.setCameraSensorHeight(15.6)
  s.setCanvasRatio(16 / 9)
  s.setSceneFlag('grid', false)
  s.setExportWidth(3000)
  return store
}

const save = (store: AppStore): SceneV1 => toSceneV1(snapshotDoc(store.getState()), store.getState().exportSettings, VERSION)

/** Simulates main writing the file and reading it back. */
const throughDisk = (scene: SceneV1): unknown => JSON.parse(JSON.stringify(scene, null, 2))

function load(raw: unknown): AppStore {
  const store = createAppStore()
  const { doc, exportSettings } = fromSceneV1(raw)
  store.getState().replaceDoc(doc)
  store.setState({ exportSettings })
  return store
}

describe('metadata round-trip', () => {
  it('save -> load -> save deep-equals the first save', () => {
    const first = save(editedStore())
    const second = save(load(throughDisk(first)))
    expect(second).toEqual(first)
  })

  it('loading restores every document slice exactly', () => {
    const original = editedStore()
    const restored = load(throughDisk(save(original)))
    expect(snapshotDoc(restored.getState())).toEqual(snapshotDoc(original.getState()))
    expect(restored.getState().exportSettings).toEqual(original.getState().exportSettings)
    expect(restored.getState().history.past).toHaveLength(0)
  })

  it('writes the schema shape with empty later-phase sections', () => {
    const scene = save(editedStore())
    expect(scene.schemaVersion).toBe(SCHEMA_VERSION)
    expect(scene.app).toEqual({ name: 'PoseLens', version: VERSION })
    expect(scene.canvas).toEqual({ aspect: 16 / 9, widthPx: 3000, heightPx: 1688 })
    expect(scene.camera.aspect).toBe(scene.canvas.aspect)
    expect(scene.camera.preset).toBe('custom')
    expect(Object.keys(scene.pose.joints)).toContain('thighL')
    expect(scene.variants).toEqual([])
    expect(scene.sketch.landmarks).toEqual({})
    expect(scene.balance.warnings).toEqual([])
  })

  it('canvas.aspect wins over camera.aspect on load', () => {
    const raw = throughDisk(save(editedStore())) as SceneV1
    raw.camera.aspect = 1
    expect(fromSceneV1(raw).doc.scene.canvasRatio).toBe(16 / 9)
  })

  it('fills missing fields with defaults', () => {
    const { doc } = fromSceneV1({ schemaVersion: 1, pose: { joints: { headL: { rx: 1 }, neck: { rx: 0.5 } } } })
    expect(doc.body.presetId).toBe('average')
    expect(doc.pose.joints.neck).toEqual({ rx: 0.5, ry: 0, rz: 0 })
    expect(doc.pose.joints.head).toEqual({ rx: 0, ry: 0, rz: 0 })
    expect(doc.camera.focal).toBe(50)
  })

  it('rejects files it cannot read', () => {
    expect(() => migrate('nope')).toThrow(SceneFormatError)
    expect(() => migrate({})).toThrow(/schemaVersion/)
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/reads up to/)
  })
})
