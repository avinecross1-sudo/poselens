import type { StateCreator } from 'zustand'
import { customPresetName, getPreset } from './presets'
import type { LibrarySlice, Store } from './types'

export const createLibrarySlice: StateCreator<Store, [], [], LibrarySlice> = (set, get) => ({
  customPresets: [],
  favoritePoses: [],
  libraryLoaded: false,

  saveCustomPreset: (modifiedFromId) => {
    const s = get()
    const base = getPreset(modifiedFromId, s.customPresets)
    const name = customPresetName(base?.name ?? modifiedFromId, s.customPresets.map((p) => p.name))
    const id = `custom-${Date.now().toString(36)}`
    set({ customPresets: [...s.customPresets, { id, name, sliders: { ...s.body.sliders }, modifiedFrom: modifiedFromId }] })
    s.edit(`Save preset ${name}`, (st) => ({ body: { ...st.body, presetId: id, modifiedFrom: modifiedFromId } }))
    return id
  },

  deleteCustomPreset: (id) => set((s) => ({ customPresets: s.customPresets.filter((p) => p.id !== id) })),

  toggleFavoritePose: (id) =>
    set((s) => ({
      favoritePoses: s.favoritePoses.includes(id) ? s.favoritePoses.filter((x) => x !== id) : [...s.favoritePoses, id],
    })),

  setLibrary: (lib) => set({ customPresets: lib.customPresets, favoritePoses: lib.favoritePoses, libraryLoaded: true }),
})
