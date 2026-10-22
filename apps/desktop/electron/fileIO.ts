import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'
import type { ReimportResult, SketchFileData } from '../src/types/ipc'
import { firstFreeName, safeFileName } from '../src/export/naming'
import { PNG_SCENE_KEYWORD, readPngText } from '../src/export/pngText'

const JSON_FILTERS = [{ name: 'PoseLens scene', extensions: ['json'] }]

/** Windows/macOS-safe folder name for {SceneName}/. */
export const safeFolderName = (name: string): string => safeFileName(name)

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

/**
 * Writes {parent}/{SceneName}/{fileBase}.png + .json. A {n} in fileBase becomes the first number for which
 * neither file exists yet; without one, an earlier export of the same name is overwritten.
 */
export async function writeExportFolder(
  parent: string,
  sceneName: string,
  fileBase: string,
  png: Uint8Array,
  meta: unknown,
): Promise<{ dir: string; file: string }> {
  const dir = join(parent, safeFolderName(sceneName))
  await mkdir(dir, { recursive: true })
  const base = firstFreeName(safeFileName(fileBase, 'export'), (n) => existsSync(join(dir, `${n}.png`)) || existsSync(join(dir, `${n}.json`)))
  await writeFile(join(dir, `${base}.png`), png)
  await writeJson(join(dir, `${base}.json`), meta)
  return { dir, file: `${base}.png` }
}

export async function pickReimportPath(win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Re-import an export (PNG with its sidecar)',
    properties: ['openFile'],
    filters: [{ name: 'PoseLens export', extensions: ['png', 'json'] }],
  })
  return res.canceled ? null : (res.filePaths[0] ?? null)
}

/**
 * The scene behind an exported PNG: {name}.json next to it, else export.json (Phase 1-3 exports), else the copy
 * embedded in the PNG. A JSON path is read as it is.
 */
export async function readExportScene(path: string): Promise<Exclude<ReimportResult, { canceled: true }>> {
  if (extname(path).toLowerCase() === '.json') return { scene: await readJson(path), path, source: 'sidecar' }
  const stem = basename(path, extname(path))
  for (const sidecar of [join(dirname(path), `${stem}.json`), join(dirname(path), 'export.json')]) {
    if (existsSync(sidecar)) return { scene: await readJson(sidecar), path: sidecar, source: 'sidecar' }
  }
  const text = readPngText(new Uint8Array(await readFile(path)), PNG_SCENE_KEYWORD)
  if (text === null) throw new Error('No sidecar JSON next to this PNG, and the PNG carries no PoseLens scene.')
  return { scene: JSON.parse(text) as unknown, path, source: 'embedded' }
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
