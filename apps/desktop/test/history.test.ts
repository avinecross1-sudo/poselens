import { describe, expect, it } from 'vitest'
import { createAppStore } from '../src/state/store'
import { MAX_HISTORY } from '../src/state/historySlice'

describe('history', () => {
  it('a slider drag coalesces into one undo step', () => {
    const store = createAppStore()
    const start = store.getState().body.sliders.mass
    for (let i = 1; i <= 50; i++) store.getState().setBodySlider('mass', start + i * 0.005, { preview: true })
    expect(store.getState().history.past).toHaveLength(0)
    store.getState().endGesture()
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().body.sliders.mass).toBeCloseTo(start + 0.25)

    store.getState().undo()
    expect(store.getState().body.sliders.mass).toBe(start)
    store.getState().redo()
    expect(store.getState().body.sliders.mass).toBeCloseTo(start + 0.25)
  })

  it('undo/redo across slices in order', () => {
    const store = createAppStore()
    const s = () => store.getState()
    s().setCameraFocal(85)
    s().setJointRotation('forearmL', { rx: -1, ry: 0, rz: 0 })
    s().applyPreset('athletic')
    expect(s().history.past.map((c) => c.label)).toEqual(['Focal length', 'Rotate forearmL', 'Preset Athletic'])

    s().undo()
    expect(s().body.presetId).toBe('average')
    s().undo()
    expect(s().pose.joints.forearmL.rx).toBe(0)
    s().undo()
    expect(s().camera.focal).toBe(50)
    s().undo() // nothing left
    expect(s().history.future).toHaveLength(3)

    s().redo()
    s().redo()
    expect(s().pose.joints.forearmL.rx).toBe(-1)
    expect(s().body.presetId).toBe('average')
  })

  it('a new edit clears redo', () => {
    const store = createAppStore()
    store.getState().setCameraFocal(85)
    store.getState().undo()
    store.getState().setCameraFocal(35)
    expect(store.getState().history.future).toHaveLength(0)
  })

  it('a no-op edit records nothing', () => {
    const store = createAppStore()
    store.getState().setCameraFocal(50)
    store.getState().setCameraRoll(0, { preview: true })
    store.getState().endGesture()
    expect(store.getState().history.past).toHaveLength(0)
  })

  it('switching controls mid-drag splits gestures', () => {
    const store = createAppStore()
    store.getState().setCameraFocal(60, { preview: true })
    store.getState().setCameraRoll(0.2, { preview: true })
    store.getState().endGesture()
    expect(store.getState().history.past.map((c) => c.label)).toEqual(['Focal length', 'Camera roll'])
  })

  it('slider edits mark the body as modified from its preset', () => {
    const store = createAppStore()
    store.getState().setBodySlider('height', 1.9)
    expect(store.getState().body.modifiedFrom).toBe('average')
    store.getState().applyPreset('slim')
    expect(store.getState().body.modifiedFrom).toBeNull()
  })

  it('caps history depth', () => {
    const store = createAppStore()
    for (let i = 0; i < MAX_HISTORY + 20; i++) store.getState().setCameraFocal(20 + (i % 200))
    expect(store.getState().history.past.length).toBeLessThanOrEqual(MAX_HISTORY)
  })
})
