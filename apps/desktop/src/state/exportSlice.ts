import type { StateCreator } from 'zustand'
import { clamp } from '../lib/units'
import { defaultExport } from './defaults'
import type { ExportSlice, Store } from './types'

/** Export width bounds in px; much above the max, WebGL may fail to allocate the buffer. */
export const MIN_EXPORT_WIDTH_PX = 64
export const MAX_EXPORT_WIDTH_PX = 8192

export const createExportSlice: StateCreator<Store, [], [], ExportSlice> = (set) => ({
  exportSettings: defaultExport(),
  sceneName: 'Untitled',
  setExportWidth: (px) =>
    set((s) => ({
      exportSettings: {
        ...s.exportSettings,
        settings: { ...s.exportSettings.settings, widthPx: Math.round(clamp(px, MIN_EXPORT_WIDTH_PX, MAX_EXPORT_WIDTH_PX)) },
      },
    })),
  setSceneName: (name) => set({ sceneName: name }),
})
