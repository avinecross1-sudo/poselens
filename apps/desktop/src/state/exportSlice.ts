import type { StateCreator } from 'zustand'
import { clamp } from '../lib/units'
import { defaultExport } from './defaults'
import type { ExportSlice, Store } from './types'

/** Export width bounds in px; much above the max, WebGL may fail to allocate the buffer. */
export const MIN_EXPORT_WIDTH_PX = 64
export const MAX_EXPORT_WIDTH_PX = 8192
/** Bounds framing margin, as a fraction of the figure's larger side. */
export const MAX_BOUNDS_MARGIN = 0.5

const px = (v: number): number => Math.round(clamp(v, MIN_EXPORT_WIDTH_PX, MAX_EXPORT_WIDTH_PX))

export const createExportSlice: StateCreator<Store, [], [], ExportSlice> = (set) => ({
  exportSettings: defaultExport(),
  sceneName: 'Untitled',
  setExportWidth: (w) =>
    set((s) => ({ exportSettings: { ...s.exportSettings, settings: { ...s.exportSettings.settings, widthPx: px(w) } } })),
  setSceneName: (name) => set({ sceneName: name }),
  setExportPreset: (preset) => set((s) => ({ exportSettings: { ...s.exportSettings, preset } })),
  setExportFraming: (framing) => set((s) => ({ exportSettings: { ...s.exportSettings, settings: { ...s.exportSettings.settings, framing } } })),
  setExportOptions: (o) =>
    set((s) => {
      const cur = s.exportSettings.settings
      return {
        exportSettings: {
          ...s.exportSettings,
          settings: {
            ...cur,
            ...o,
            fixedWidthPx: o.fixedWidthPx === undefined ? cur.fixedWidthPx : px(o.fixedWidthPx),
            fixedHeightPx: o.fixedHeightPx === undefined ? cur.fixedHeightPx : px(o.fixedHeightPx),
            boundsMargin: o.boundsMargin === undefined ? cur.boundsMargin : clamp(o.boundsMargin, 0, MAX_BOUNDS_MARGIN),
          },
        },
      }
    }),
  setNamingTemplate: (namingTemplate) => set((s) => ({ exportSettings: { ...s.exportSettings, namingTemplate } })),
})
