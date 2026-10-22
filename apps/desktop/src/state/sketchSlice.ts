import type { StateCreator } from 'zustand'
import { clamp } from '../lib/units'
import { MAX_SKETCH_SCALE, MIN_SKETCH_SCALE } from '../lib/sketchSpace'
import { applySolution, solveFromSketch } from '../solve/cameraSolve'
import { MAX_VPS, type SketchMeta, type Vec2 } from '../types/scene'
import { defaultSketch } from './defaults'
import type { SketchSlice, Store } from './types'

/** Recorded in sketch.solve.settings so a saved scene shows what the last solve found. */
const solveSettings = (s: {
  pitch: number
  roll: number
  focalMm: number
  focalRangeMm: [number, number]
  pitchRange: [number, number]
  focalSolved: boolean
  horizonSource: string
  warnings: string[]
}): Record<string, unknown> => ({ ...s })

/** Edits that change the cues make an earlier solve stale. */
const clearSolve = (s: SketchMeta): SketchMeta['solve'] => (s.solve.baked ? s.solve : { settings: {}, confidence: {}, baked: false })

export const createSketchSlice: StateCreator<Store, [], [], SketchSlice> = (_set, get) => {
  const editSketch = (label: string, fn: (s: SketchMeta) => SketchMeta, opts?: { preview?: boolean }): void =>
    get().edit(label, (st) => ({ sketch: fn(st.sketch) }), opts)

  return {
    sketch: defaultSketch(),

    importSketch: (image, path) => {
      get().cacheSketchImage(image)
      get().setCueTool('none')
      get().setSketchMessage(null)
      get().edit('Import sketch', () => ({ sketch: { ...defaultSketch(), hash: image.hash, path, size: { width: image.width, height: image.height } } }))
    },

    removeSketch: () => {
      get().setCueTool('none')
      get().setSketchMessage(null)
      get().edit('Remove sketch', () => ({ sketch: defaultSketch() }))
    },

    setSketchAlignment: (a, opts) => {
      if (get().sketchView.locked) return
      editSketch(
        'Move sketch',
        (s) => ({
          ...s,
          alignment: {
            ...s.alignment,
            ...a,
            scale: clamp(a.scale ?? s.alignment.scale, MIN_SKETCH_SCALE, MAX_SKETCH_SCALE),
          },
          solve: clearSolve(s),
        }),
        opts,
      )
    },

    resetSketchAlignment: () => {
      if (get().sketchView.locked) return
      editSketch('Reset sketch placement', (s) => ({ ...s, alignment: defaultSketch().alignment, solve: clearSolve(s) }))
    },

    setHorizon: (h, opts) => editSketch('Place horizon', (s) => ({ ...s, horizon: h, solve: clearSolve(s) }), opts),

    setHorizonPoint: (index, p, opts) =>
      editSketch(
        'Move horizon point',
        (s) => {
          if (!s.horizon) return s
          const h: [Vec2, Vec2] = index === 0 ? [p, s.horizon[1]] : [s.horizon[0], p]
          return { ...s, horizon: h, solve: clearSolve(s) }
        },
        opts,
      ),

    addVp: (p) =>
      editSketch('Add vanishing point', (s) => (s.vps.length >= MAX_VPS ? s : { ...s, vps: [...s.vps, p], solve: clearSolve(s) })),

    moveVp: (index, p, opts) =>
      editSketch(
        'Move vanishing point',
        (s) => (index < 0 || index >= s.vps.length ? s : { ...s, vps: s.vps.map((v, i) => (i === index ? p : v)), solve: clearSolve(s) }),
        opts,
      ),

    removeVp: (index) => editSketch('Remove vanishing point', (s) => ({ ...s, vps: s.vps.filter((_, i) => i !== index), solve: clearSolve(s) })),

    clearCues: () => {
      get().setCueDraft(null)
      editSketch('Clear perspective cues', (s) => ({ ...s, horizon: null, vps: [], solve: clearSolve(s) }))
    },

    solveCameraFromSketch: () => {
      const s = get()
      const result = solveFromSketch(s.sketch, s.camera, s.scene.canvasRatio)
      if (!result.ok) {
        get().setSketchMessage(result.reason)
        return result
      }
      get().setSketchMessage(null)
      const sol = result.solution
      // One command covers camera and solve record, so a single undo restores the previous camera exactly.
      get().edit('Solve camera from sketch', (st) => ({
        camera: applySolution(st.camera, sol),
        sketch: {
          ...st.sketch,
          solve: { settings: solveSettings(sol), confidence: { camera: sol.confidence }, baked: false },
        },
      }))
      return result
    },
  }
}
