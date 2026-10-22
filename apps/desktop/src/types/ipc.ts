import type { SceneV1 } from './scene'

export const IPC = {
  sceneSave: 'scene:save',
  sceneLoad: 'scene:load',
  exportWrite: 'export:write',
  appInfo: 'app:info',
  libraryLoad: 'library:load',
  librarySave: 'library:save',
  sketchImport: 'sketch:import',
  sketchRead: 'sketch:read',
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

/** A sketch image read by main. hash is 'sha256:<hex>' of the file bytes. */
export interface SketchFileData {
  path: string
  name: string
  hash: string
  bytes: Uint8Array
}
export type SketchImportResult = SketchFileData | Canceled

export interface PoseLensApi {
  saveScene(req: SceneSaveRequest): Promise<SceneSaveResult>
  loadScene(): Promise<SceneLoadResult>
  writeExport(req: ExportWriteRequest): Promise<ExportWriteResult>
  appInfo(): Promise<AppInfo>
  /** null when nothing has been saved yet. Unvalidated JSON. */
  loadLibrary(): Promise<unknown>
  saveLibrary(lib: UserLibraryFile): Promise<void>
  /** Opens a PNG/JPG picker. */
  importSketch(): Promise<SketchImportResult>
  /** Re-reads a previously imported sketch; null when the file is gone or is not a PNG/JPG. */
  readSketch(path: string): Promise<SketchFileData | null>
}
