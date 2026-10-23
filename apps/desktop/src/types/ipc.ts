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
  exportReimport: 'export:reimport',
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
  /** File base name from the naming template; main replaces {n} with the first free number. */
  fileBase: string
}
export type ExportWriteResult = { dir: string; file: string } | Canceled

/** A re-imported export: the sidecar JSON next to the PNG, or the copy embedded in the PNG when the sidecar is gone. */
export type ReimportResult = { scene: unknown; path: string; source: 'sidecar' | 'embedded' } | Canceled

export interface AppInfo {
  version: string
}

/** User library (custom body presets, favorite poses), stored by main in the app's userData folder. */
export interface UserLibraryFile {
  version: 1
  customPresets: { id: string; name: string; sliders: Record<string, number>; modifiedFrom?: string }[]
  favoritePoses: string[]
  /** Tags and notes per body preset id (Phase 4; missing in older files). */
  presetMeta?: Record<string, { tags: string[]; notes: string }>
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
  /** Opens a PNG (or sidecar JSON) picker and returns the scene saved with that export. */
  reimportExport(): Promise<ReimportResult>
}
