// Renderer-side save / load / export / re-import flows. All file I/O is delegated to main through window.poselens.
import { appStore } from '../state/store'
import { snapshotDoc } from '../state/historySlice'
import { getViewportHandle } from '../three/viewportHandle'
import { fromSceneV1, toSceneV1 } from './metadata'
import type { BodyState, SceneV1 } from '../types/scene'
import type { Doc } from '../state/types'
import { rigOf, stylizeOf } from '../state/rigOf'
import { retargetPose } from '../solve/retarget'
import { restoreSketchImage } from './sketchFile'
import { applyNamingTemplate } from './naming'
import { embedPngText, PNG_SCENE_KEYWORD } from './pngText'

let versionPromise: Promise<string> | null = null
const appVersion = (): Promise<string> => (versionPromise ??= window.poselens.appInfo().then((i) => i.version))

async function currentScene(): Promise<SceneV1> {
  const s = appStore.getState()
  s.endGesture()
  return toSceneV1(snapshotDoc(s), s.exportSettings, await appVersion(), s.sceneName)
}

export type FileResult = { ok: true; message: string } | { ok: false; message: string } | { ok: null }

export async function saveScene(): Promise<FileResult> {
  const res = await window.poselens.saveScene({ scene: await currentScene(), suggestedName: appStore.getState().sceneName })
  return 'canceled' in res ? { ok: null } : { ok: true, message: `Saved ${res.path}` }
}

/** Scene name from a path: export.json uses its {SceneName}/ folder, other files their own name. */
export function sceneNameFromPath(path: string): string {
  const parts = path.split(/[\/]/).filter(Boolean)
  const file = parts[parts.length - 1] ?? 'Untitled'
  if (/^(export|scene)\.(json|png)$/i.test(file) && parts.length > 1) return parts[parts.length - 2] ?? 'Untitled'
  return file.replace(/(\.scene)?\.(json|png)$/i, '') || 'Untitled'
}

/**
 * Puts a loaded scene onto a different body: the pose keeps its rotations, bone lengths come from
 * `body`, and the root is re-grounded. Returns the retargeted doc and any warnings.
 */
export function retargetDocToBody(doc: Doc, body: BodyState): { doc: Doc; warnings: string[] } {
  const r = retargetPose(doc.pose, rigOf(doc.body), rigOf(body), { from: stylizeOf(doc.body), to: stylizeOf(body) })
  return { doc: { ...doc, body, pose: r.pose }, warnings: r.warnings }
}

/** Replaces the open scene with a parsed file. keepBody retargets it onto the current body instead. */
async function openScene(raw: unknown, path: string, opts: { keepBody?: boolean; verb: string }): Promise<FileResult> {
  try {
    const loaded = fromSceneV1(raw)
    const s = appStore.getState()
    const { doc, warnings } = opts.keepBody ? retargetDocToBody(loaded.doc, s.body) : { doc: loaded.doc, warnings: [] }
    s.replaceDoc(doc)
    appStore.setState({
      exportSettings: loaded.exportSettings,
      sceneName: loaded.name ?? sceneNameFromPath(path),
      selectedJoint: null,
      activeVariantId: null,
    })
    s.setPoseWarnings(warnings)
    s.setCueTool('none')
    const sketchWarning = await restoreSketchImage()
    s.setSketchMessage(sketchWarning)
    if (sketchWarning) warnings.push(sketchWarning)
    if (warnings.length) return { ok: false, message: `${opts.verb} with warnings: ${warnings.join('; ')}` }
    return { ok: true, message: `${opts.verb} ${path}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** keepBody: load pose, camera and scene settings, but keep the current body and retarget onto it. */
export async function loadScene(opts: { keepBody?: boolean } = {}): Promise<FileResult> {
  const res = await window.poselens.loadScene()
  if ('canceled' in res) return { ok: null }
  return openScene(res.scene, res.path, { keepBody: opts.keepBody, verb: opts.keepBody ? 'Loaded onto the current body:' : 'Loaded' })
}

/** Restores the full scene behind an exported PNG (its sidecar, or the copy embedded in the PNG). */
export async function reimportExport(): Promise<FileResult> {
  const res = await window.poselens.reimportExport()
  if ('canceled' in res) return { ok: null }
  return openScene(res.scene, res.path, { verb: res.source === 'embedded' ? 'Re-imported (from the PNG itself)' : 'Re-imported' })
}

/** File base name for the next export, before main fills {n}. */
export function exportFileBase(): string {
  const s = appStore.getState()
  const variant = s.variants.find((v) => v.id === s.activeVariantId)?.name ?? ''
  return applyNamingTemplate(s.exportSettings.namingTemplate, { scene: s.sceneName || 'Untitled', variant, preset: s.exportSettings.preset, date: new Date() })
}

export async function exportPng(): Promise<FileResult> {
  const handle = getViewportHandle()
  if (!handle) return { ok: false, message: 'Viewport not ready' }
  const scene = await currentScene()
  const s = appStore.getState()
  const out = await handle.renderExport({ camera: s.camera, aspect: s.scene.canvasRatio, preset: s.exportSettings.preset, options: s.exportSettings.settings })
  const png = embedPngText(out.png, PNG_SCENE_KEYWORD, JSON.stringify(scene))
  const res = await window.poselens.writeExport({ png, scene, sceneName: s.sceneName, fileBase: exportFileBase() })
  return 'canceled' in res ? { ok: null } : { ok: true, message: `Exported ${res.file} to ${res.dir}` }
}
