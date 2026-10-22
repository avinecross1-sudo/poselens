import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dialog, type BrowserWindow } from 'electron'

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
