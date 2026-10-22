import type { SceneV1 } from './scene'

export const IPC = {
  sceneSave: 'scene:save',
  sceneLoad: 'scene:load',
  exportWrite: 'export:write',
  appInfo: 'app:info',
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

export interface PoseLensApi {
  saveScene(req: SceneSaveRequest): Promise<SceneSaveResult>
  loadScene(): Promise<SceneLoadResult>
  writeExport(req: ExportWriteRequest): Promise<ExportWriteResult>
  appInfo(): Promise<AppInfo>
}
