import { useState } from 'react'
import { exportPng, type FileResult } from '../export/sceneFile'
import { exportHeightPx } from '../export/metadata'
import { MAX_EXPORT_WIDTH_PX, MIN_EXPORT_WIDTH_PX } from '../state/exportSlice'
import { useStore } from '../state/store'

export function ExportPanel({ onResult }: { onResult: (r: FileResult) => void }) {
  const widthPx = useStore((s) => s.exportSettings.settings.widthPx)
  const ratio = useStore((s) => s.scene.canvasRatio)
  const sceneName = useStore((s) => s.sceneName)
  const setExportWidth = useStore((s) => s.setExportWidth)
  const setSceneName = useStore((s) => s.setSceneName)
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      onResult(await exportPng())
    } catch (e) {
      onResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-2 text-xs">
      <h2 className="text-sm font-semibold text-neutral-200">Export</h2>
      <label className="block">
        <span className="text-neutral-400">Scene name</span>
        <input
          className="mt-0.5 w-full rounded bg-neutral-800 px-2 py-1 text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
        />
      </label>
      <label className="flex items-center justify-between">
        <span className="text-neutral-400">Width</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            className="w-20 rounded bg-neutral-800 px-1 py-0.5 text-right text-neutral-200"
            min={MIN_EXPORT_WIDTH_PX}
            max={MAX_EXPORT_WIDTH_PX}
            value={widthPx}
            onChange={(e) => setExportWidth(Number(e.target.value))}
          />
          <span className="text-neutral-500">× {exportHeightPx(widthPx, ratio)} px</span>
        </span>
      </label>
      <p className="text-neutral-500">Transparent PNG through the shot camera, plus export.json sidecar, in {'{folder}'}/{sceneName || 'Untitled'}/.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="w-full rounded bg-sky-600 py-1.5 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? 'Exporting…' : 'Export PNG + JSON'}
      </button>
    </section>
  )
}
