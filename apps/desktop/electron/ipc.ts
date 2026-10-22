import { app, ipcMain, type BrowserWindow } from 'electron'
import {
  IPC,
  type AppInfo,
  type ExportWriteRequest,
  type ExportWriteResult,
  type SceneLoadResult,
  type SceneSaveRequest,
  type ReimportResult,
  type SceneSaveResult,
  type SketchFileData,
  type SketchImportResult,
  type UserLibraryFile,
} from '../src/types/ipc'
import { join } from 'node:path'
import {
  pickFolder,
  pickOpenPath,
  pickReimportPath,
  pickSavePath,
  pickSketchPath,
  readExportScene,
  readJson,
  readJsonIfExists,
  readSketchFile,
  writeExportFolder,
  writeJson,
} from './fileIO'

const LIBRARY_FILE = 'library.json'
const libraryPath = (): string => join(app.getPath('userData'), LIBRARY_FILE)

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
    return writeExportFolder(parent, req.sceneName, req.fileBase, req.png, req.scene)
  })

  ipcMain.handle(IPC.exportReimport, async (): Promise<ReimportResult> => {
    const path = await pickReimportPath(win())
    if (!path) return { canceled: true }
    return readExportScene(path)
  })

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion() }))

  ipcMain.handle(IPC.libraryLoad, (): Promise<unknown> => readJsonIfExists(libraryPath()))

  ipcMain.handle(IPC.sketchImport, async (): Promise<SketchImportResult> => {
    const path = await pickSketchPath(win())
    if (!path) return { canceled: true }
    const data = await readSketchFile(path)
    if (!data) throw new Error('That file could not be found.')
    return data
  })

  ipcMain.handle(IPC.sketchRead, (_e, path: string): Promise<SketchFileData | null> => readSketchFile(String(path)))

  ipcMain.handle(IPC.librarySave, async (_e, lib: UserLibraryFile): Promise<void> => {
    await writeJson(libraryPath(), lib)
  })
}
