import type { SceneV1 } from './scene'

export const IPC = {
  sceneSave: 'scene:save',
  sceneLoad: 'scene:load',
  exportWrite: 'export:write',
  appInfo: 'app:info',
  libraryLoad: 'library:load',
  librarySave: 'library:save',
} as const

export type Canceled = { canceled: true }

export interface SceneSaveRequest {
  scene: SceneV1
  suggestedName: string
}
export type SceneSaveResult = { path: string } | Canceled

/** `scene` is unparsed-shape JSON; the renderer validates and migrates it. */
export type SceneLoadResult = { scene: unknown; path: string } | Canceled

export interface ExportWriteRequest {
  png: Uint8Array
  scene: SceneV1
  sceneName: string
}
export type ExportWriteResult = { dir: string } | Canceled

export interface AppInfo {
  version: string
}

/** User library (custom body presets, favorite poses), stored by main in the app's userData folder. */
export interface UserLibraryFile {
  version: 1
  customPresets: { id: string; name: string; sliders: Record<string, number>; modifiedFrom?: string }[]
  favoritePoses: string[]
}

export interface PoseLensApi {
  saveScene(req: SceneSaveRequest): Promise<SceneSaveResult>
  loadScene(): Promise<SceneLoadResult>
  writeExport(req: ExportWriteRequest): Promise<ExportWriteResult>
  appInfo(): Promise<AppInfo>
  /** null when nothing has been saved yet. Unvalidated JSON. */
  loadLibrary(): Promise<unknown>
  saveLibrary(lib: UserLibraryFile): Promise<void>
}
