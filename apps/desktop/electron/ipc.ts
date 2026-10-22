import { app, ipcMain, type BrowserWindow } from 'electron'
import {
  IPC,
  type AppInfo,
  type ExportWriteRequest,
  type ExportWriteResult,
  type SceneLoadResult,
  type SceneSaveRequest,
  type SceneSaveResult,
} from '../src/types/ipc'
import { pickFolder, pickOpenPath, pickSavePath, readJson, writeExportFolder, writeJson } from './fileIO'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const win = (): BrowserWindow => {
    const w = getWindow()
    if (!w) throw new Error('No window')
    return w
  }

  ipcMain.handle(IPC.sceneSave, async (_e, req: SceneSaveRequest): Promise<SceneSaveResult> => {
    const path = await pickSavePath(win(), req.suggestedName)
    if (!path) return { canceled: true }
    await writeJson(path, req.scene)
    return { path }
  })

  ipcMain.handle(IPC.sceneLoad, async (): Promise<SceneLoadResult> => {
    const path = await pickOpenPath(win())
    if (!path) return { canceled: true }
    return { scene: await readJson(path), path }
  })

  ipcMain.handle(IPC.exportWrite, async (_e, req: ExportWriteRequest): Promise<ExportWriteResult> => {
    const parent = await pickFolder(win())
    if (!parent) return { canceled: true }
    const dir = await writeExportFolder(parent, req.sceneName, req.png, req.scene)
    return { dir }
  })

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion() }))
}
