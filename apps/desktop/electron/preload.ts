import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PoseLensApi } from '../src/types/ipc'

const api: PoseLensApi = {
  saveScene: (req) => ipcRenderer.invoke(IPC.sceneSave, req),
  loadScene: () => ipcRenderer.invoke(IPC.sceneLoad),
  writeExport: (req) => ipcRenderer.invoke(IPC.exportWrite, req),
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  loadLibrary: () => ipcRenderer.invoke(IPC.libraryLoad),
  saveLibrary: (lib) => ipcRenderer.invoke(IPC.librarySave, lib),
  importSketch: () => ipcRenderer.invoke(IPC.sketchImport),
  readSketch: (path) => ipcRenderer.invoke(IPC.sketchRead, path),
  reimportExport: () => ipcRenderer.invoke(IPC.exportReimport),
}

contextBridge.exposeInMainWorld('poselens', api)
