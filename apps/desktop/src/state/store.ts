import { createStore, useStore as useZustandStore } from 'zustand'
import { createBodySlice } from './bodySlice'
import { createCameraSlice } from './cameraSlice'
import { createExportSlice } from './exportSlice'
import { createHistorySlice } from './historySlice'
import { createPoseSlice } from './poseSlice'
import { createSceneSlice } from './sceneSlice'
import type { Store } from './types'
import { createUiSlice } from './uiSlice'

/** Factory so tests get an isolated store. */
export const createAppStore = () =>
  createStore<Store>()((...a) => ({
    ...createHistorySlice(...a),
    ...createSceneSlice(...a),
    ...createBodySlice(...a),
    ...createPoseSlice(...a),
    ...createCameraSlice(...a),
    ...createExportSlice(...a),
    ...createUiSlice(...a),
  }))

export type AppStore = ReturnType<typeof createAppStore>

export const appStore: AppStore = createAppStore()

export function useStore<T>(selector: (s: Store) => T): T {
  return useZustandStore(appStore, selector)
}
