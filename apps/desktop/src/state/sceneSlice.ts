import type { StateCreator } from 'zustand'
import { defaultMeta, defaultScene } from './defaults'
import type { SceneSlice, Store } from './types'

/** Tags longer than this are cut; they are labels, not notes. */
export const MAX_TAG_LENGTH = 40

export const normalizeTag = (tag: string): string => tag.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)

/** Adds a tag unless it is empty or already there (case-insensitive). */
export function withTag(tags: readonly string[], tag: string): string[] {
  const t = normalizeTag(tag)
  if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return [...tags]
  return [...tags, t]
}

export const createSceneSlice: StateCreator<Store, [], [], SceneSlice> = (_set, get) => ({
  scene: defaultScene(),
  meta: defaultMeta(),
  setCanvasRatio: (ratio) => get().edit('Aspect ratio', (s) => ({ scene: { ...s.scene, canvasRatio: ratio } })),
  setSceneFlag: (key, value) => get().edit(`Toggle ${key}`, (s) => ({ scene: { ...s.scene, [key]: value } })),
  addSceneTag: (tag) => get().edit(`Tag ${normalizeTag(tag)}`, (s) => ({ meta: { ...s.meta, tags: withTag(s.meta.tags, tag) } })),
  removeSceneTag: (tag) => get().edit(`Remove tag ${tag}`, (s) => ({ meta: { ...s.meta, tags: s.meta.tags.filter((t) => t !== tag) } })),
  setSceneNotes: (notes, opts) => get().edit('Scene notes', (s) => ({ meta: { ...s.meta, notes } }), opts),
})
