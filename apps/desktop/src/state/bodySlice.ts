import type { StateCreator } from 'zustand'
import { defaultBody } from './defaults'
import { getPreset } from './presets'
import type { BodySlice, Store } from './types'

export const createBodySlice: StateCreator<Store, [], [], BodySlice> = (_set, get) => ({
  body: defaultBody(),

  applyPreset: (presetId) => {
    const preset = getPreset(presetId)
    if (!preset) return
    get().edit(`Preset ${preset.name}`, (s) => ({
      body: { ...s.body, presetId: preset.id, modifiedFrom: null, sliders: { ...preset.sliders } },
    }))
  },

  setBodySlider: (key, value, opts) =>
    get().edit(
      `Body ${key}`,
      (s) => ({ body: { ...s.body, modifiedFrom: s.body.presetId, sliders: { ...s.body.sliders, [key]: value } } }),
      opts,
    ),
})
