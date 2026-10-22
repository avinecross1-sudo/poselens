import { useState } from 'react'
import { exportFileBase, exportPng, reimportExport, type FileResult } from '../export/sceneFile'
import { exportHeightPx } from '../export/metadata'
import { COUNTER_TOKEN, NAMING_TOKENS } from '../export/naming'
import { MAX_BOUNDS_MARGIN, MAX_EXPORT_WIDTH_PX, MIN_EXPORT_WIDTH_PX } from '../state/exportSlice'
import { useStore } from '../state/store'
import { EXPORT_FRAMINGS, EXPORT_PRESETS, type ExportFraming, type ExportPreset } from '../types/scene'
import { chipBtn } from '../ui/Section'

const PRESET_LABELS: Record<ExportPreset, { label: string; hint: string }> = {
  clean: { label: 'Clean', hint: 'The figure as drawn (mannequin or anatomy look)' },
  lineart: { label: 'Lineart', hint: 'Black outlines, overlaps and creases on transparent' },
  silhouette: { label: 'Silhouette', hint: 'Solid flat fill' },
  shaded: { label: 'Shaded', hint: 'Three-value light, half-tone and shadow blocks' },
}
const FRAMING_LABELS: Record<ExportFraming, { label: string; hint: string }> = {
  viewport: { label: 'Shot frame', hint: 'The whole shot camera frame' },
  bounds: { label: 'Figure bounds', hint: 'Cropped to the figure plus a margin, at the same pixel density' },
  fixed: { label: 'Fixed canvas', hint: 'A set canvas size; the shot keeps its vertical field of view' },
}
const PERCENT = 100

const numInput = 'rounded bg-neutral-800 px-1 py-0.5 text-right text-neutral-200'

export function ExportPanel({ onResult }: { onResult: (r: FileResult) => void }) {
  const ex = useStore((s) => s.exportSettings)
  const ratio = useStore((s) => s.scene.canvasRatio)
  const sceneName = useStore((s) => s.sceneName)
  // Subscribed so the file name preview follows the active shot.
  useStore((s) => s.activeVariantId)
  useStore((s) => s.variants)
  const a = useStore((s) => s)
  const [busy, setBusy] = useState(false)
  const o = ex.settings

  const run = async (fn: () => Promise<FileResult>): Promise<void> => {
    setBusy(true)
    try {
      onResult(await fn())
    } catch (e) {
      onResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const preview = exportFileBase().split(COUNTER_TOKEN).join('1')

  return (
    <section className="space-y-2 text-xs">
      <h2 className="text-sm font-semibold text-neutral-200">Export</h2>
      <div>
        <div className="mb-1 text-neutral-400">Preset</div>
        <div className="flex flex-wrap gap-1">
          {EXPORT_PRESETS.map((p) => (
            <button key={p} type="button" className={chipBtn(ex.preset === p)} title={PRESET_LABELS[p].hint} onClick={() => a.setExportPreset(p)}>
              {PRESET_LABELS[p].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 text-neutral-400">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={o.grid} onChange={(e) => a.setExportOptions({ grid: e.target.checked })} />
          Grid
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={o.shadow} onChange={(e) => a.setExportOptions({ shadow: e.target.checked })} />
          Ground shadow
        </label>
      </div>
      <div>
        <div className="mb-1 text-neutral-400">Framing</div>
        <div className="flex flex-wrap gap-1">
          {EXPORT_FRAMINGS.map((f) => (
            <button key={f} type="button" className={chipBtn(o.framing === f)} title={FRAMING_LABELS[f].hint} onClick={() => a.setExportFraming(f)}>
              {FRAMING_LABELS[f].label}
            </button>
          ))}
        </div>
      </div>
      {o.framing === 'fixed' ? (
        <label className="flex items-center justify-between">
          <span className="text-neutral-400">Canvas</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              className={`w-16 ${numInput}`}
              min={MIN_EXPORT_WIDTH_PX}
              max={MAX_EXPORT_WIDTH_PX}
              value={o.fixedWidthPx}
              onChange={(e) => a.setExportOptions({ fixedWidthPx: Number(e.target.value) })}
            />
            ×
            <input
              type="number"
              className={`w-16 ${numInput}`}
              min={MIN_EXPORT_WIDTH_PX}
              max={MAX_EXPORT_WIDTH_PX}
              value={o.fixedHeightPx}
              onChange={(e) => a.setExportOptions({ fixedHeightPx: Number(e.target.value) })}
            />
            px
          </span>
        </label>
      ) : (
        <label className="flex items-center justify-between">
          <span className="text-neutral-400">{o.framing === 'bounds' ? 'Frame width' : 'Width'}</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              className={`w-20 ${numInput}`}
              min={MIN_EXPORT_WIDTH_PX}
              max={MAX_EXPORT_WIDTH_PX}
              value={o.widthPx}
              onChange={(e) => a.setExportWidth(Number(e.target.value))}
            />
            <span className="text-neutral-500">× {exportHeightPx(o.widthPx, ratio)} px</span>
          </span>
        </label>
      )}
      {o.framing === 'bounds' && (
        <label className="flex items-center justify-between">
          <span className="text-neutral-400">Margin</span>
          <span className="flex items-center gap-1">
            <input
              type="number"
              className={`w-14 ${numInput}`}
              min={0}
              max={MAX_BOUNDS_MARGIN * PERCENT}
              value={Math.round(o.boundsMargin * PERCENT)}
              onChange={(e) => a.setExportOptions({ boundsMargin: Number(e.target.value) / PERCENT })}
            />
            %
          </span>
        </label>
      )}
      <label className="block">
        <span className="text-neutral-400">File name</span>
        <input
          className="mt-0.5 w-full rounded bg-neutral-800 px-2 py-1 font-mono text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
          value={ex.namingTemplate}
          onChange={(e) => a.setNamingTemplate(e.target.value)}
        />
        <span className="text-[11px] text-neutral-500">
          {NAMING_TOKENS.join(' ')} → {preview}.png
        </span>
      </label>
      <p className="text-neutral-500">
        Transparent PNG through the shot camera, plus a JSON sidecar (also embedded in the PNG), in {'{folder}'}/{sceneName || 'Untitled'}/.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(exportPng)}
        className="w-full rounded bg-sky-600 py-1.5 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
      >
        {busy ? 'Working…' : 'Export PNG + JSON'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(reimportExport)}
        className="w-full rounded bg-neutral-800 py-1 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
        title="Open an exported PNG (or its JSON) and restore the full scene it was made from"
      >
        Re-import export…
      </button>
    </section>
  )
}
