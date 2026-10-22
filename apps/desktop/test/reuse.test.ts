import { describe, expect, it } from 'vitest'
import { snapshotDoc } from '../src/state/historySlice'
import { createAppStore, type AppStore } from '../src/state/store'
import { getPreset } from '../src/state/presets'
import { MAX_VARIANTS, nextVariantName, copyName } from '../src/state/variantsSlice'
import { jointPosition, lowestPoint, posePositions } from '../src/solve/fk'
import { rigOf } from '../src/state/rigOf'
import { normalizeTag, MAX_TAG_LENGTH } from '../src/state/sceneSlice'
import { describeProvenance } from '../src/state/clipboardSlice'
import type { Doc } from '../src/state/types'

const ground = (store: AppStore): number => {
  const s = store.getState()
  return lowestPoint(rigOf(s.body), posePositions(rigOf(s.body), s.pose))
}

const headHeight = (store: AppStore): number => {
  const s = store.getState()
  return jointPosition(posePositions(rigOf(s.body), s.pose), 'head').y
}

/** Builds a scene document in its own store, as if it had been saved and is now loaded. */
function sceneDoc(build: (s: AppStore) => void): Doc {
  const store = createAppStore()
  build(store)
  return structuredClone(snapshotDoc(store.getState()))
}

/** Scene A: heroic body, arm raised, low camera. */
const sceneA = (): Doc =>
  sceneDoc((st) => {
    const s = st.getState()
    s.applyPreset('heroic')
    s.setJointRotation('upperArmR', { rx: 0, ry: 0, rz: -2.2 })
    s.setCameraHeight(0.4)
    s.setCameraFocal(28)
  })

/** Scene B: a child with bent knees, one joint locked. */
const sceneB = (): Doc =>
  sceneDoc((st) => {
    const s = st.getState()
    s.applyPreset('child')
    s.setJointRotation('thighL', { rx: -0.8, ry: 0, rz: 0 })
    s.setJointRotation('shinL', { rx: 1.1, ry: 0, rz: 0 })
    s.setJointRotation('forearmR', { rx: -1.2, ry: 0, rz: 0 })
    s.toggleJointLock('forearmR')
    s.setRootTransform({ position: [0.4, s.pose.rootTransform.position[1], -0.2], rotation: [0, 0.6, 0] })
  })

function open(store: AppStore, doc: Doc, name: string): void {
  store.getState().replaceDoc(structuredClone(doc))
  store.setState({ sceneName: name })
}

describe('clipboard: body profile', () => {
  it('copy body A -> paste into scene B: B gets A body and its pose is retargeted onto it', () => {
    const store = createAppStore()
    const s = () => store.getState()
    open(store, sceneA(), 'Scene A')
    s().copyBody()
    const heroic = getPreset('heroic')!.sliders

    const b = sceneB()
    open(store, b, 'Scene B')
    const groundBefore = ground(store)
    const headBefore = headHeight(store)
    expect(s().pasteBody()).toBe(true)

    expect(s().body.sliders).toEqual(heroic)
    expect(s().body.presetId).toBe('heroic')
    // Rotations, locks and root placement are B's; the bones are A's, so the figure is taller and still grounded.
    expect(s().pose.joints).toEqual(b.pose.joints)
    expect(s().pose.jointLocks).toEqual(['forearmR'])
    expect(s().pose.rootTransform.position[0]).toBe(b.pose.rootTransform.position[0])
    expect(s().pose.rootTransform.position[2]).toBe(b.pose.rootTransform.position[2])
    expect(s().pose.rootTransform.rotation).toEqual(b.pose.rootTransform.rotation)
    expect(headHeight(store)).toBeGreaterThan(headBefore + 0.5)
    expect(ground(store)).toBeCloseTo(groundBefore, 6)
    // Camera and scene settings stay B's.
    expect(s().camera).toEqual(b.camera)

    expect(s().history.past.at(-1)?.label).toBe('Paste body from Scene A')
    s().undo()
    expect(snapshotDoc(s())).toEqual(b)
  })

  it('locked body sliders keep their values', () => {
    const store = createAppStore()
    open(store, sceneA(), 'Scene A')
    store.getState().copyBody()
    open(store, sceneB(), 'Scene B')
    store.getState().toggleBodyLock('height')
    const h = store.getState().body.sliders.height
    store.getState().pasteBody()
    expect(store.getState().body.sliders.height).toBe(h)
    expect(store.getState().body.sliders.headScale).toBe(getPreset('heroic')!.sliders.headScale)
  })

  it('records provenance and survives loading another scene', () => {
    const store = createAppStore()
    open(store, sceneA(), 'Scene A')
    store.getState().copyBody()
    open(store, sceneB(), 'Scene B')
    const p = store.getState().clipboard.body!.provenance
    expect(p.sceneName).toBe('Scene A')
    expect(p.presetId).toBe('heroic')
    expect(Number.isNaN(Date.parse(p.copiedAt))).toBe(false)
    expect(describeProvenance(p)).toMatch(/^Scene A \(Heroic, copied /)
  })
})

describe('clipboard: pose and camera', () => {
  it('a pose copied on one body is retargeted onto another and grounded', () => {
    const store = createAppStore()
    const s = () => store.getState()
    const b = sceneB()
    open(store, b, 'Scene B')
    s().copyPose()
    open(store, sceneA(), 'Scene A')
    s().toggleJointLock('upperArmR')
    const lockedArm = { ...s().pose.joints.upperArmR }
    s().pastePose()
    expect(s().pose.joints.thighL).toEqual(b.pose.joints.thighL)
    expect(s().pose.joints.shinL).toEqual(b.pose.joints.shinL)
    // Locks belong to the target scene.
    expect(s().pose.joints.upperArmR).toEqual(lockedArm)
    expect(s().pose.jointLocks).toEqual(['upperArmR'])
    expect(s().pose.depthNudges).toEqual({})
    expect(ground(store)).toBeCloseTo(0, 6)
    expect(s().body.presetId).toBe('heroic')
  })

  it('camera paste copies the whole camera and is refused under trace lock', () => {
    const store = createAppStore()
    const s = () => store.getState()
    const a = sceneA()
    open(store, a, 'Scene A')
    s().copyCamera()
    open(store, sceneB(), 'Scene B')
    s().setSketchView({ traceLock: true })
    expect(s().pasteCamera()).toBe(false)
    s().setSketchView({ traceLock: false })
    expect(s().pasteCamera()).toBe(true)
    expect(s().camera).toEqual(a.camera)
  })

  it('paste with an empty clipboard does nothing', () => {
    const store = createAppStore()
    expect(store.getState().pasteBody()).toBe(false)
    expect(store.getState().pastePose()).toBe(false)
    expect(store.getState().pasteCamera()).toBe(false)
    expect(store.getState().history.past).toHaveLength(0)
  })
})

describe('shots (variants)', () => {
  it('saves up to four named shots and restores camera + pose', () => {
    const store = createAppStore()
    const s = () => store.getState()
    const ids: (string | null)[] = []
    for (let i = 0; i < MAX_VARIANTS; i++) {
      s().setCameraFocal(20 + i * 10)
      s().setJointRotation('upperArmL', { rx: 0, ry: 0, rz: 0.3 * i })
      ids.push(s().addVariant())
    }
    expect(s().variants.map((v) => v.name)).toEqual(['Shot 1', 'Shot 2', 'Shot 3', 'Shot 4'])
    expect(s().addVariant()).toBeNull()
    expect(s().duplicateVariant(ids[0]!)).toBeNull()

    s().applyVariant(ids[1]!)
    expect(s().camera.focal).toBe(30)
    expect(s().pose.joints.upperArmL.rz).toBeCloseTo(0.3)
    expect(s().activeVariantId).toBe(ids[1])
    s().undo()
    expect(s().camera.focal).toBe(50)
  })

  it('rename, update, duplicate and delete are undoable document edits', () => {
    const store = createAppStore()
    const s = () => store.getState()
    const id = s().addVariant('Hero')!
    s().renameVariant(id, '  Low angle  ')
    expect(s().variants[0]!.name).toBe('Low angle')
    s().setCameraFocal(85)
    s().updateVariant(id)
    expect(s().variants[0]!.camera.focal).toBe(85)
    const copy = s().duplicateVariant(id)!
    expect(s().variants.map((v) => v.name)).toEqual(['Low angle', 'Low angle copy'])
    expect(s().variants[1]!.id).toBe(copy)
    s().deleteVariant(id)
    expect(s().variants.map((v) => v.id)).toEqual([copy])
    s().undo()
    expect(s().variants).toHaveLength(2)
  })

  it('names: first free "Shot n" and "copy" suffixes', () => {
    const v = (name: string) => ({ id: name, name, camera: {} as never, pose: {} as never })
    expect(nextVariantName([v('Shot 1'), v('Shot 3')])).toBe('Shot 2')
    expect(copyName('Hero', ['Hero copy'])).toBe('Hero copy 2')
  })

  it('duplicate scene keeps the document under a new name with a fresh history', () => {
    const store = createAppStore()
    const s = () => store.getState()
    store.setState({ sceneName: 'Cover' })
    s().setCameraFocal(35)
    s().addVariant()
    const before = snapshotDoc(s())
    s().duplicateScene()
    expect(s().sceneName).toBe('Cover copy')
    expect(snapshotDoc(s())).toEqual(before)
    expect(s().history.past).toHaveLength(0)
  })
})

describe('scene tags and notes', () => {
  it('tags are trimmed, unique ignoring case, and undoable', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().addSceneTag('  hero  shot ')
    s().addSceneTag('HERO SHOT')
    s().addSceneTag('   ')
    s().addSceneTag('cover')
    expect(s().meta.tags).toEqual(['hero shot', 'cover'])
    s().removeSceneTag('hero shot')
    expect(s().meta.tags).toEqual(['cover'])
    s().undo()
    expect(s().meta.tags).toEqual(['hero shot', 'cover'])
    expect(normalizeTag('x'.repeat(100))).toHaveLength(MAX_TAG_LENGTH)
  })

  it('typing notes is one undo step', () => {
    const store = createAppStore()
    const s = () => store.getState()
    for (const t of ['L', 'Lo', 'Low', 'Low angle']) s().setSceneNotes(t, { preview: true })
    s().endGesture()
    expect(s().meta.notes).toBe('Low angle')
    expect(s().history.past).toHaveLength(1)
  })

  it('preset tags and notes live in the library, per preset', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setPresetTags('heroic', ['comic'])
    s().setPresetNotes('heroic', 'Cover hero')
    s().setPresetNotes('slim', 'Background extras')
    expect(s().presetMeta).toEqual({ heroic: { tags: ['comic'], notes: 'Cover hero' }, slim: { tags: [], notes: 'Background extras' } })
    expect(s().history.past).toHaveLength(0)
  })
})
