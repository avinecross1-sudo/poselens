// Renderer-side save / load / export flows. All file I/O is delegated to main through window.poselens.
import { appStore } from '../state/store'
import { snapshotDoc } from '../state/historySlice'
import { getViewportHandle } from '../three/viewportHandle'
import { exportHeightPx, fromSceneV1, toSceneV1 } from './metadata'
import type { BodyState, SceneV1 } from '../types/scene'
import type { Doc } from '../state/types'
import { rigOf, stylizeOf } from '../state/rigOf'
import { retargetPose } from '../solve/retarget'
import { restoreSketchImage } from './sketchFile'

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

/**
 * Puts a loaded scene onto a different body: the pose keeps its rotations, bone lengths come from
 * `body`, and the root is re-grounded. Returns the retargeted doc and any warnings.
 */
export function retargetDocToBody(doc: Doc, body: BodyState): { doc: Doc; warnings: string[] } {
  const r = retargetPose(doc.pose, rigOf(doc.body), rigOf(body), { from: stylizeOf(doc.body), to: stylizeOf(body) })
  return { doc: { ...doc, body, pose: r.pose }, warnings: r.warnings }
}

/** keepBody: load pose, camera and scene settings, but keep the current body and retarget onto it. */
export async function loadScene(opts: { keepBody?: boolean } = {}): Promise<FileResult> {
  const res = await window.poselens.loadScene()
  if ('canceled' in res) return { ok: null }
  try {
    const loaded = fromSceneV1(res.scene)
    const s = appStore.getState()
    const { doc, warnings } = opts.keepBody ? retargetDocToBody(loaded.doc, s.body) : { doc: loaded.doc, warnings: [] }
    s.replaceDoc(doc)
    appStore.setState({ exportSettings: loaded.exportSettings, sceneName: sceneNameFromPath(res.path), selectedJoint: null })
    s.setPoseWarnings(warnings)
    s.setCueTool('none')
    const sketchWarning = await restoreSketchImage()
    s.setSketchMessage(sketchWarning)
    if (sketchWarning) warnings.push(sketchWarning)
    if (warnings.length) return { ok: false, message: `${opts.keepBody ? 'Loaded onto current body' : 'Loaded'} with warnings: ${warnings.join('; ')}` }
    return { ok: true, message: opts.keepBody ? `Loaded ${res.path} onto the current body` : `Loaded ${res.path}` }
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
