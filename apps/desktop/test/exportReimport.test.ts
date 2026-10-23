import { describe, expect, it } from 'vitest'
import { fromSceneV1, toSceneV1 } from '../src/export/metadata'
import { applyNamingTemplate, fillCounter, firstFreeName, safeFileName } from '../src/export/naming'
import { embedPngText, isPng, PNG_SCENE_KEYWORD, readPngText } from '../src/export/pngText'
import { boundsCrop, exportFrame } from '../src/export/framing'
import { decodeDepth, flipRows, lineart } from '../src/export/lineart'
import { sceneNameFromPath } from '../src/export/sceneFile'
import { snapshotDoc } from '../src/state/historySlice'
import { createAppStore, type AppStore } from '../src/state/store'
import { defaultExport } from '../src/state/defaults'
import type { SceneV1 } from '../src/types/scene'

const VERSION = '0.1.0'

/** Minimal PNG layout: signature, IHDR, IDAT, IEND (CRCs are not checked by the chunk walker). */
function chunk(type: string, data: number[]): number[] {
  const n = data.length
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
}
const TINY_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  ...chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0, 0, 0, 2, 0, 1]),
  ...chunk('IEND', []),
])

/** A scene with every Phase 1–4 field set. */
function richStore(): AppStore {
  const store = createAppStore()
  const s = store.getState()
  s.applyPreset('athletic')
  s.setBodySlider('mass', 0.71)
  s.setAsymmetry('rightLegThickness', 1.1, false)
  s.setJointRotation('upperArmL', { rx: 0.2, ry: -0.3, rz: 1.1 })
  s.setJointRotation('thighR', { rx: -0.5, ry: 0.05, rz: 0 })
  s.setHandShape('L', 'fist')
  s.setRootTransform({ position: [0.25, 0, -0.4], rotation: [0, 0.9, 0] })
  s.setCameraFocal(21)
  s.setCameraYaw(-0.4)
  s.setCameraRoll(0.05)
  s.setCanvasRatio(3 / 4)
  s.setSceneFlag('groundShadow', true)
  s.addVariant('Hero low')
  s.setCameraFocal(85)
  s.setJointRotation('head', { rx: 0.2, ry: 0.4, rz: 0 })
  s.addVariant('Portrait')
  s.addSceneTag('cover')
  s.addSceneTag('issue 3')
  s.setSceneNotes('Rim light from the left; café scene')
  s.setExportPreset('lineart')
  s.setExportFraming('bounds')
  s.setExportOptions({ grid: true, shadow: true, boundsMargin: 0.12, fixedWidthPx: 1200, fixedHeightPx: 1800 })
  s.setNamingTemplate('{scene}_{variant}_{n}')
  s.setExportWidth(2400)
  store.setState({ sceneName: 'Café – Issue 3' })
  return store
}

/** What exportPng writes: the sidecar JSON, and the same JSON embedded in the PNG. */
function exportFiles(store: AppStore): { sidecar: string; png: Uint8Array } {
  const s = store.getState()
  const scene = toSceneV1(snapshotDoc(s), s.exportSettings, VERSION, s.sceneName)
  const json = JSON.stringify(scene, null, 2)
  return { sidecar: json, png: embedPngText(TINY_PNG, PNG_SCENE_KEYWORD, JSON.stringify(scene)) }
}

/** What reimportExport does with the file it gets back. */
function reimport(raw: unknown): AppStore {
  const store = createAppStore()
  const loaded = fromSceneV1(raw)
  store.getState().replaceDoc(loaded.doc)
  store.setState({ exportSettings: loaded.exportSettings, sceneName: loaded.name ?? 'Untitled' })
  return store
}

/** Deep comparison with a numeric tolerance (JSON numbers round-trip exactly, but the check should not depend on it). */
function expectClose(a: unknown, b: unknown, path = '$'): void {
  if (typeof a === 'number' && typeof b === 'number') {
    expect(Math.abs(a - b), path).toBeLessThan(1e-9)
    return
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    expect(a.length, path).toBe(b.length)
    a.forEach((x, i) => expectClose(x, b[i], `${path}[${i}]`))
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort())
    for (const k of Object.keys(a)) expectClose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`)
    return
  }
  expect(a, path).toEqual(b)
}

describe('re-import PNG + sidecar (round trip)', () => {
  it('the sidecar restores the full scene within tolerance', () => {
    const original = richStore()
    const { sidecar } = exportFiles(original)
    const restored = reimport(JSON.parse(sidecar))
    const o = original.getState()
    const r = restored.getState()
    expectClose(snapshotDoc(r), snapshotDoc(o))
    expectClose(r.exportSettings, o.exportSettings)
    expect(r.sceneName).toBe('Café – Issue 3')
    expect(r.variants.map((v) => v.name)).toEqual(['Hero low', 'Portrait'])
    expect(r.meta).toEqual({ tags: ['cover', 'issue 3'], notes: 'Rim light from the left; café scene' })
    expect(r.scene.groundShadow).toBe(true)
  })

  it('the PNG alone restores the same scene from its embedded copy', () => {
    const original = richStore()
    const { png, sidecar } = exportFiles(original)
    expect(isPng(png)).toBe(true)
    const embedded = readPngText(png, PNG_SCENE_KEYWORD)
    expect(embedded).not.toBeNull()
    expect(JSON.parse(embedded!)).toEqual(JSON.parse(sidecar))
    expectClose(snapshotDoc(reimport(JSON.parse(embedded!)).getState()), snapshotDoc(original.getState()))
  })

  it('export -> re-import -> export writes the same sidecar', () => {
    const first = exportFiles(richStore()).sidecar
    const second = exportFiles(reimport(JSON.parse(first))).sidecar
    expect(second).toBe(first)
  })

  it('applying a restored shot gives the camera and pose it was saved with', () => {
    const original = richStore()
    const restored = reimport(JSON.parse(exportFiles(original).sidecar))
    const v = restored.getState().variants[0]!
    restored.getState().applyVariant(v.id)
    expect(restored.getState().camera.focal).toBe(21)
    expect(restored.getState().pose).toEqual(original.getState().variants[0]!.pose)
  })

  it('Phase 3 exports (no Phase 4 fields) still load with defaults', () => {
    const store = createAppStore()
    const s = store.getState()
    const old = toSceneV1(snapshotDoc(s), s.exportSettings, VERSION) as Partial<SceneV1> & Record<string, unknown>
    delete old.name
    old.variants = []
    old.export = { preset: 'clean', namingTemplate: '{scene}', settings: { widthPx: 2000 } } as unknown as SceneV1['export']
    old.scene = { groundPlane: true, grid: true, horizon: true } as SceneV1['scene']
    const loaded = fromSceneV1(JSON.parse(JSON.stringify(old)))
    expect(loaded.name).toBeNull()
    expect(loaded.doc.scene.groundShadow).toBe(false)
    expect(loaded.doc.variants).toEqual([])
    expect(loaded.doc.meta).toEqual({ tags: [], notes: '' })
    expect(loaded.exportSettings).toEqual({ ...defaultExport(), namingTemplate: '{scene}' })
  })

  it('bad export fields and extra variants are cleaned up on load', () => {
    const s = createAppStore().getState()
    const file = toSceneV1(snapshotDoc(s), s.exportSettings, VERSION) as unknown as Record<string, unknown>
    file['export'] = { preset: 'watercolour', settings: { framing: 'poster', widthPx: 1000 } }
    file['variants'] = Array.from({ length: 6 }, (_, i) => ({ id: 'same', name: `V${i}` }))
    const loaded = fromSceneV1(file)
    expect(loaded.exportSettings.preset).toBe('clean')
    expect(loaded.exportSettings.settings.framing).toBe('viewport')
    expect(loaded.doc.variants).toHaveLength(4)
    expect(new Set(loaded.doc.variants.map((v) => v.id)).size).toBe(4)
  })

  it('scene names from export paths', () => {
    expect(sceneNameFromPath('C:/out/Hero/export.png')).toBe('Hero')
    expect(sceneNameFromPath('/out/Hero/Hero_low_2.json')).toBe('Hero_low_2')
  })
})

describe('PNG text chunk', () => {
  it('embeds UTF-8 text, replaces an earlier copy, and keeps the PNG valid', () => {
    const once = embedPngText(TINY_PNG, PNG_SCENE_KEYWORD, '{"a":"é"}')
    const twice = embedPngText(once, PNG_SCENE_KEYWORD, '{"a":"ü"}')
    expect(readPngText(twice, PNG_SCENE_KEYWORD)).toBe('{"a":"ü"}')
    expect(twice.length).toBe(once.length)
    // IEND stays last.
    expect(String.fromCharCode(...twice.subarray(twice.length - 8, twice.length - 4))).toBe('IEND')
    expect(readPngText(TINY_PNG, PNG_SCENE_KEYWORD)).toBeNull()
    expect(() => readPngText(new Uint8Array([1, 2, 3]), PNG_SCENE_KEYWORD)).toThrow(/Not a PNG/)
  })
})

describe('naming template', () => {
  const ctx = { scene: 'Hero', variant: 'Low angle', preset: 'lineart', date: new Date(2026, 9, 23) }

  it('fills tokens and keeps {n} for main', () => {
    expect(applyNamingTemplate('{scene}_{variant}_{n}', ctx)).toBe('Hero_Low angle_{n}')
    expect(applyNamingTemplate('{scene}-{preset}-{date}', ctx)).toBe('Hero-lineart-2026-10-23')
  })

  it('tidies separators left by an empty variant and unsafe characters', () => {
    expect(applyNamingTemplate('{scene}_{variant}_{n}', { ...ctx, variant: '' })).toBe('Hero_{n}')
    expect(applyNamingTemplate('{scene}', { ...ctx, scene: 'a/b:c' })).toBe('a_b_c')
    expect(applyNamingTemplate('', ctx)).toBe('Hero')
    expect(safeFileName('  ...  ')).toBe('Untitled')
  })

  it('{n} becomes the first free number', () => {
    const taken = new Set(['Hero_1', 'Hero_2'])
    expect(firstFreeName('Hero_{n}', (n) => taken.has(n))).toBe('Hero_3')
    expect(firstFreeName('Hero', () => true)).toBe('Hero')
    expect(fillCounter('a{n}b{n}', 7)).toBe('a7b7')
  })
})

describe('export framing', () => {
  const opts = { ...defaultExport().settings, widthPx: 1000 }

  it('viewport = the shot frame', () => {
    expect(exportFrame(opts, 0.5, null)).toEqual({ widthPx: 1000, heightPx: 2000, aspect: 0.5, crop: null })
  })

  it('bounds crops to the figure plus margin at the same pixel density, clamped to the frame', () => {
    const box = { minX: -0.2, maxX: 0.2, minY: -0.5, maxY: 0.5 }
    const crop = boundsCrop(box, 1000, 2000, 0.1)!
    // Figure: x 400..600, y 500..1500 (1000 tall) -> 100 px margin.
    expect(crop).toEqual({ x: 300, y: 400, w: 400, h: 1200 })
    const f = exportFrame({ ...opts, framing: 'bounds', boundsMargin: 0.1 }, 0.5, box)
    expect(f.widthPx).toBe(400)
    expect(f.crop).toEqual({ x: 300, y: 400, w: 400, h: 1200, fullW: 1000, fullH: 2000 })
    expect(boundsCrop({ minX: -2, maxX: 2, minY: -0.1, maxY: 0.1 }, 1000, 2000, 0.1)).toEqual({ x: 0, y: 700, w: 1000, h: 600 })
    // No figure in view: the whole frame.
    expect(exportFrame({ ...opts, framing: 'bounds' }, 0.5, null).crop).toBeNull()
  })

  it('fixed uses the set canvas', () => {
    const f = exportFrame({ ...opts, framing: 'fixed', fixedWidthPx: 1200, fixedHeightPx: 800 }, 0.5, null)
    expect(f).toEqual({ widthPx: 1200, heightPx: 800, aspect: 1.5, crop: null })
  })
})

describe('lineart edges', () => {
  /** w x h buffers: a square figure facing the camera with a nearer square in front of it. */
  function scene(w: number, h: number) {
    const normals = new Uint8Array(w * h * 4)
    const depth = new Uint8Array(w * h * 4)
    const near = 1
    const far = 3
    const put = (x: number, y: number, z: number, n: [number, number, number]) => {
      const i = (y * w + x) * 4
      normals.set([...n.map((v) => Math.round((v * 0.5 + 0.5) * 255)), 255], i)
      const v = Math.round(((z - near) / (far - near)) * 65535)
      depth.set([v >> 8, v & 255, 0, 255], i)
    }
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) put(x, y, 2, [0, 0, 1])
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) put(x, y, 1.5, [0, 0, 1])
    return { w, h, normals, depth, near, far }
  }

  it('decodes the packed depth', () => {
    const s = scene(20, 20)
    expect(decodeDepth(s.depth, 2 * 20 + 2, s.near, s.far)).toBeCloseTo(2, 4)
  })

  it('draws the outline and the overlap contour on the nearer side, nothing on flat interiors or background', () => {
    const s = scene(20, 20)
    const out = lineart(s)
    const at = (x: number, y: number) => out[(y * 20 + x) * 4 + 3]
    expect(at(2, 10)).toBe(255) // outline
    expect(at(0, 0)).toBe(0) // background
    expect(at(13, 13)).toBe(0) // flat interior
    expect(at(6, 7)).toBe(255) // nearer square's edge
    expect(at(5, 7)).toBe(0) // far side of the depth step stays clean
  })

  it('draws creases where normals turn sharply', () => {
    const s = scene(20, 20)
    // Right half of the big square faces sideways.
    for (let y = 2; y < 18; y++) for (let x = 12; x < 18; x++) s.normals.set([255, 128, 128, 255], (y * 20 + x) * 4)
    const out = lineart(s)
    expect(out[(14 * 20 + 11) * 4 + 3]).toBe(255)
  })

  it('flips rows in place', () => {
    const b = new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3])
    flipRows(b, 1, 3)
    expect([...b]).toEqual([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1])
  })
})
