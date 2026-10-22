import type { StateCreator } from 'zustand'
import type { Variant } from '../types/scene'
import { snapshotDoc } from './historySlice'
import type { Store, VariantsSlice } from './types'

/** Phase 4: two to four named shots per scene. */
export const MAX_VARIANTS = 4
const MAX_VARIANT_NAME = 40

let counter = 0
export const newVariantId = (): string => `v-${Date.now().toString(36)}-${(counter++).toString(36)}`

/** "Shot 1", "Shot 2", … – the first number not already used. */
export function nextVariantName(variants: readonly Variant[]): string {
  const taken = new Set(variants.map((v) => v.name))
  let n = 1
  while (taken.has(`Shot ${n}`)) n++
  return `Shot ${n}`
}

const cleanName = (name: string, fallback: string): string => name.trim().slice(0, MAX_VARIANT_NAME) || fallback

/** "<name> copy", or "<name> copy 2" if taken. */
export function copyName(name: string, taken: readonly string[]): string {
  const base = `${name} copy`
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export const createVariantsSlice: StateCreator<Store, [], [], VariantsSlice> = (set, get) => {
  const find = (id: string): Variant | undefined => get().variants.find((v) => v.id === id)

  return {
    variants: [],
    activeVariantId: null,

    addVariant: (name) => {
      const s = get()
      if (s.variants.length >= MAX_VARIANTS) return null
      const id = newVariantId()
      const v: Variant = { id, name: cleanName(name ?? '', nextVariantName(s.variants)), camera: structuredClone(s.camera), pose: structuredClone(s.pose) }
      s.edit(`Save shot ${v.name}`, (st) => ({ variants: [...st.variants, v] }))
      set({ activeVariantId: id })
      return id
    },

    updateVariant: (id) => {
      const v = find(id)
      if (!v) return
      get().edit(`Update shot ${v.name}`, (s) => ({
        variants: s.variants.map((x) => (x.id === id ? { ...x, camera: structuredClone(s.camera), pose: structuredClone(s.pose) } : x)),
      }))
      set({ activeVariantId: id })
    },

    applyVariant: (id) => {
      const v = find(id)
      if (!v) return
      // Trace lock freezes the shot camera; the pose still applies.
      const keepCamera = get().sketchView.traceLock
      get().edit(`Go to shot ${v.name}`, () => ({
        pose: structuredClone(v.pose),
        ...(keepCamera ? {} : { camera: structuredClone(v.camera) }),
      }))
      set({ activeVariantId: id, selectedJoint: null })
    },

    renameVariant: (id, name) => {
      const v = find(id)
      if (!v) return
      const next = cleanName(name, v.name)
      get().edit(`Rename shot ${next}`, (s) => ({ variants: s.variants.map((x) => (x.id === id ? { ...x, name: next } : x)) }))
    },

    deleteVariant: (id) => {
      const v = find(id)
      if (!v) return
      get().edit(`Delete shot ${v.name}`, (s) => ({ variants: s.variants.filter((x) => x.id !== id) }))
      if (get().activeVariantId === id) set({ activeVariantId: null })
    },

    duplicateVariant: (id) => {
      const s = get()
      const v = find(id)
      if (!v || s.variants.length >= MAX_VARIANTS) return null
      const copy: Variant = { ...structuredClone(v), id: newVariantId(), name: copyName(v.name, s.variants.map((x) => x.name)) }
      s.edit(`Duplicate shot ${v.name}`, (st) => {
        const at = st.variants.findIndex((x) => x.id === id)
        return { variants: [...st.variants.slice(0, at + 1), copy, ...st.variants.slice(at + 1)] }
      })
      return copy.id
    },

    duplicateScene: () => {
      const s = get()
      s.endGesture()
      s.replaceDoc(structuredClone(snapshotDoc(s)))
      set({ sceneName: copyName(s.sceneName || 'Untitled', []) })
    },
  }
}
