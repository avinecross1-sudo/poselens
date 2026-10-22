// Renderer-side save / load / export flows. All file I/O is delegated to main through window.poselens.
import { appStore } from '../state/store'
import { snapshotDoc } from '../state/historySlice'
import { getViewportHandle } from '../three/viewportHandle'
import { exportHeightPx, fromSceneV1, toSceneV1 } from './metadata'
import type { SceneV1 } from '../types/scene'

let versionPromise: Promise<string> | null = null
const appVersion = (): Promise<string> => (versionPromise ??= window.poselens.appInfo().then((i) => i.version))

async function currentScene(): Promise<SceneV1> {
  const s = appStore.getState()
  s.endGesture()
  return toSceneV1(snapshotDoc(s), s.exportSettings, await appVersion())
}

export type FileResult = { ok: true; message: string } | { ok: false; message: string } | { ok: null }

export async function saveScene(): Promise<FileResult> {
  const res = await window.poselens.saveScene({ scene: await currentScene(), suggestedName: appStore.getState().sceneName })
  return 'canceled' in res ? { ok: null } : { ok: true, message: `Saved ${res.path}` }
}

/** Scene name from a path: export.json uses its {SceneName}/ folder, other files their own name. */
export function sceneNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  const file = parts[parts.length - 1] ?? 'Untitled'
  if (/^(export|scene)\.json$/i.test(file) && parts.length > 1) return parts[parts.length - 2] ?? 'Untitled'
  return file.replace(/(\.scene)?\.json$/i, '') || 'Untitled'
}

export async function loadScene(): Promise<FileResult> {
  const res = await window.poselens.loadScene()
  if ('canceled' in res) return { ok: null }
  try {
    const { doc, exportSettings } = fromSceneV1(res.scene)
    const s = appStore.getState()
    s.replaceDoc(doc)
    appStore.setState({ exportSettings, sceneName: sceneNameFromPath(res.path), selectedJoint: null })
    return { ok: true, message: `Loaded ${res.path}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function exportPng(): Promise<FileResult> {
  const handle = getViewportHandle()
  if (!handle) return { ok: false, message: 'Viewport not ready' }
  const scene = await currentScene()
  const png = await handle.renderExport(scene.canvas.widthPx, exportHeightPx(scene.canvas.widthPx, scene.canvas.aspect))
  const res = await window.poselens.writeExport({ png, scene, sceneName: appStore.getState().sceneName })
  return 'canceled' in res ? { ok: null } : { ok: true, message: `Exported to ${res.dir}` }
}
