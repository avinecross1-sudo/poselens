import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PoseLensApi } from '../src/types/ipc'

const api: PoseLensApi = {
  saveScene: (req) => ipcRenderer.invoke(IPC.sceneSave, req),
  loadScene: () => ipcRenderer.invoke(IPC.sceneLoad),
  writeExport: (req) => ipcRenderer.invoke(IPC.exportWrite, req),
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
}

contextBridge.exposeInMainWorld('poselens', api)
