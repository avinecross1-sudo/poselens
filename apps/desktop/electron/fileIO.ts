import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import type { SketchFileData } from '../src/types/ipc'

const JSON_FILTERS = [{ name: 'PoseLens scene', extensions: ['json'] }]

/** Windows/macOS-safe folder name for {SceneName}/. */
export function safeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '')
  return cleaned.length > 0 ? cleaned : 'Untitled'
}

export async function pickSavePath(win: BrowserWindow, suggestedName: string): Promise<string | null> {
  const res = await dialog.showSaveDialog(win, {
    title: `Save scene "${suggestedName}"`,
    defaultPath: 'scene.json',
    filters: JSON_FILTERS,
  })
  return res.canceled || !res.filePath ? null : res.filePath
}

export async function pickOpenPath(win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Open scene or export sidecar',
    properties: ['openFile'],
    filters: JSON_FILTERS,
  })
  return res.canceled ? null : (res.filePaths[0] ?? null)
}

export async function pickFolder(win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose export folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  return res.canceled ? null : (res.filePaths[0] ?? null)
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown
}

/** Writes {parent}/{SceneName}/export.png + export.json and returns the folder. */
export async function writeExportFolder(
  parent: string,
  sceneName: string,
  png: Uint8Array,
  meta: unknown,
): Promise<string> {
  const dir = join(parent, safeFolderName(sceneName))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'export.png'), png)
  await writeJson(join(dir, 'export.json'), meta)
  return dir
}


/** null when the file does not exist yet; other read or parse errors propagate. */
export async function readJsonIfExists(path: string): Promise<unknown> {
  try {
    return await readJson(path)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

const SKETCH_EXTENSIONS = ['.png', '.jpg', '.jpeg']
/** Sketches are reference drawings; anything larger than this is almost certainly the wrong file. */
const MAX_SKETCH_BYTES = 64 * 1024 * 1024

export async function pickSketchPath(win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Import sketch',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  })
  return res.canceled ? null : (res.filePaths[0] ?? null)
}

/** Reads a PNG/JPG and hashes it. Returns null if the file is missing; throws for other problems. */
export async function readSketchFile(path: string): Promise<SketchFileData | null> {
  if (!SKETCH_EXTENSIONS.includes(extname(path).toLowerCase())) throw new Error('Sketches must be PNG or JPG files.')
  try {
    const info = await stat(path)
    if (!info.isFile()) return null
    if (info.size > MAX_SKETCH_BYTES) throw new Error('That image is larger than 64 MB.')
    const bytes = await readFile(path)
    return { path, name: basename(path), hash: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), bytes: new Uint8Array(bytes) }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}
