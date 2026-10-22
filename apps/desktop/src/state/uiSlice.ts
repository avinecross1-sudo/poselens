import type { StateCreator } from 'zustand'
import { IK_CHAIN_IDS, type IkChainId } from '../solve/ik'
import type { Store, UiSlice } from './types'

export const createUiSlice: StateCreator<Store, [], [], UiSlice> = (set) => ({
  activeCamera: 'editor',
  selectedJoint: null,
  ikEnabled: Object.fromEntries(IK_CHAIN_IDS.map((c) => [c, true])) as Record<IkChainId, boolean>,
  overlays: { headUnits: false, gaze: false, ikHandles: true },
  poseWarnings: [],
  sketchImages: {},
  sketchView: { visible: true, opacity: 0.6, locked: false, showCues: true },
  cueTool: 'none',
  cueDraft: null,
  sketchMessage: null,
  setActiveCamera: (c) => set({ activeCamera: c }),
  selectJoint: (j) => set({ selectedJoint: j }),
  setIkEnabled: (chain, on) => set((s) => ({ ikEnabled: { ...s.ikEnabled, [chain]: on } })),
  setOverlay: (key, on) => set((s) => ({ overlays: { ...s.overlays, [key]: on } })),
  // Skip the store update when nothing changes, so drags do not re-render the warning strip.
  cacheSketchImage: (image) => set((s) => ({ sketchImages: { ...s.sketchImages, [image.hash]: image } })),
  setSketchView: (v) => set((s) => ({ sketchView: { ...s.sketchView, ...v } })),
  setCueTool: (t) => set({ cueTool: t, cueDraft: null }),
  setCueDraft: (p) => set({ cueDraft: p }),
  setSketchMessage: (m) => set({ sketchMessage: m }),
  setPoseWarnings: (w) => set((s) => (s.poseWarnings.join('\n') === w.join('\n') ? {} : { poseWarnings: w })),
})
