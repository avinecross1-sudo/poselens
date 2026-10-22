// Renderer-side sketch import / reload. File access is delegated to main through window.poselens.
import { appStore } from '../state/store'
import type { SketchImage } from '../state/types'
import type { SketchFileData } from '../types/ipc'
import type { FileResult } from './sceneFile'

const mimeOf = (name: string): string => (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg')

/** Decodes the bytes into an object URL and reads the pixel size. Rejects if the browser cannot decode it. */
export async function decodeSketch(file: SketchFileData): Promise<SketchImage> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: mimeOf(file.name) }))
  try {
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error(`${file.name} could not be read as an image.`))
      img.src = url
    })
    if (dims.width < 1 || dims.height < 1) throw new Error(`${file.name} has no pixels.`)
    return { hash: file.hash, name: file.name, url, ...dims }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export async function importSketch(): Promise<FileResult> {
  const res = await window.poselens.importSketch()
  if ('canceled' in res) return { ok: null }
  try {
    const image = await decodeSketch(res)
    appStore.getState().importSketch(image, res.path)
    return { ok: true, message: `Imported ${image.name} (${image.width}×${image.height})` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * After a scene loads: finds the sketch image its metadata names. Returns a warning for the status
 * line when the file is missing or has changed since the scene was saved, else null.
 */
export async function restoreSketchImage(): Promise<string | null> {
  const s = appStore.getState()
  const { hash, path } = s.sketch
  if (!hash || s.sketchImages[hash]) return null
  if (!path) return 'The scene references a sketch with no file path; re-import it.'
  try {
    const file = await window.poselens.readSketch(path)
    if (!file) return `Sketch file not found: ${path}. Cues are kept; import the image again to see them.`
    if (file.hash !== hash) return `The sketch at ${path} has changed since this scene was saved; re-import it to line up the cues.`
    s.cacheSketchImage(await decodeSketch(file))
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
