// Loads the user library at startup and writes it back whenever it changes. I/O goes through main.
import type { UserLibraryFile } from '../types/ipc'
import { BODY_SLIDER_KEYS, type BodySliders, type SceneMeta } from '../types/scene'
import { NEUTRAL_SLIDERS } from './bodySliders'
import type { BodyPreset } from './presets'
import type { AppStore } from './store'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Validates library JSON; anything malformed is dropped rather than failing the app. */
export function parseLibrary(raw: unknown): { customPresets: BodyPreset[]; favoritePoses: string[]; presetMeta: Record<string, SceneMeta> } {
  if (!isObj(raw)) return { customPresets: [], favoritePoses: [], presetMeta: {} }
  const presets = Array.isArray(raw['customPresets']) ? raw['customPresets'] : []
  const customPresets: BodyPreset[] = presets.filter(isObj).flatMap((p) => {
    if (typeof p['id'] !== 'string' || typeof p['name'] !== 'string' || !isObj(p['sliders'])) return []
    const s = p['sliders']
    const sliders = Object.fromEntries(
      BODY_SLIDER_KEYS.map((k) => [k, typeof s[k] === 'number' && Number.isFinite(s[k]) ? s[k] : NEUTRAL_SLIDERS[k]]),
    ) as BodySliders
    return [{ id: p['id'], name: p['name'], sliders, ...(typeof p['modifiedFrom'] === 'string' ? { modifiedFrom: p['modifiedFrom'] } : {}) }]
  })
  const favs = Array.isArray(raw['favoritePoses']) ? raw['favoritePoses'] : []
  const presetMeta: Record<string, SceneMeta> = {}
  for (const [id, m] of Object.entries(isObj(raw['presetMeta']) ? raw['presetMeta'] : {})) {
    if (!isObj(m)) continue
    const tags = Array.isArray(m['tags']) ? m['tags'].filter((t): t is string => typeof t === 'string') : []
    const notes = typeof m['notes'] === 'string' ? m['notes'] : ''
    if (tags.length || notes) presetMeta[id] = { tags, notes }
  }
  return { customPresets, favoritePoses: favs.filter((x): x is string => typeof x === 'string'), presetMeta }
}

export const toLibraryFile = (s: { customPresets: BodyPreset[]; favoritePoses: string[]; presetMeta: Record<string, SceneMeta> }): UserLibraryFile => ({
  version: 1,
  customPresets: s.customPresets.map((p) => ({ ...p, sliders: { ...p.sliders } })),
  favoritePoses: [...s.favoritePoses],
  // Empty entries are dropped so the file only carries real tags and notes.
  presetMeta: Object.fromEntries(
    Object.entries(s.presetMeta)
      .filter(([, m]) => m.tags.length > 0 || m.notes.trim() !== '')
      .map(([id, m]) => [id, { tags: [...m.tags], notes: m.notes }]),
  ),
})

export function startLibraryPersistence(store: AppStore): () => void {
  const api = window.poselens
  if (!api) {
    store.getState().setLibrary({ customPresets: [], favoritePoses: [] })
    return () => {}
  }
  api
    .loadLibrary()
    .then((raw) => store.getState().setLibrary(parseLibrary(raw)))
    .catch((e: unknown) => {
      console.error('Could not read the user library', e)
      store.getState().setLibrary({ customPresets: [], favoritePoses: [] })
    })
  return store.subscribe((s, prev) => {
    // Saving before the load finishes would overwrite the file with an empty library.
    if (!s.libraryLoaded || !prev.libraryLoaded) return
    if (s.customPresets === prev.customPresets && s.favoritePoses === prev.favoritePoses && s.presetMeta === prev.presetMeta) return
    api.saveLibrary(toLibraryFile(s)).catch((e: unknown) => console.error('Could not save the user library', e))
  })
}
