import type { StateCreator } from 'zustand'
import type { Store, UiSlice } from './types'

export const createUiSlice: StateCreator<Store, [], [], UiSlice> = (set) => ({
  activeCamera: 'editor',
  selectedJoint: null,
  setActiveCamera: (c) => set({ activeCamera: c }),
  selectJoint: (j) => set({ selectedJoint: j }),
})
