import type { StateCreator } from 'zustand'
import { defaultScene } from './defaults'
import type { SceneSlice, Store } from './types'

export const createSceneSlice: StateCreator<Store, [], [], SceneSlice> = (_set, get) => ({
  scene: defaultScene(),
  setCanvasRatio: (ratio) => get().edit('Aspect ratio', (s) => ({ scene: { ...s.scene, canvasRatio: ratio } })),
  setSceneFlag: (key, value) => get().edit(`Toggle ${key}`, (s) => ({ scene: { ...s.scene, [key]: value } })),
})
