// Multi-shot variants: 2–4 named camera + pose snapshots, side-by-side compare.
import { useEffect, useState } from 'react'
import { MAX_VARIANTS } from '../state/variantsSlice'
import { appStore, useStore } from '../state/store'
import { getViewportHandle } from '../three/viewportHandle'
import { smallBtn } from '../ui/Section'
import type { ExportPreset } from '../types/scene'
import type { ViewLook } from '../state/types'

/** Compare thumbnails are rendered this tall (px). */
const THUMB_HEIGHT_PX = 420
/** The compare view shows the shots in the viewport's readability look (depth falls back to the figure as drawn). */
const LOOK_TO_PRESET: Record<ViewLook, ExportPreset> = { normal: 'clean', silhouette: 'silhouette', values: 'shaded', depth: 'clean' }

export function ShotsPanel() {
  const variants = useStore((s) => s.variants)
  const active = useStore((s) => s.activeVariantId)
  const a = useStore((s) => s)
  const [editing, setEditing] = useState<string | null>(null)
  const [compare, setCompare] = useState(false)

  return (
    <section className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Shots</h2>
        <div className="flex gap-1">
          <button type="button" className={smallBtn} disabled={variants.length < 2} onClick={() => setCompare(true)} title="Side-by-side view of every shot">
            Compare
          </button>
          <button
            type="button"
            className={smallBtn}
            disabled={variants.length >= MAX_VARIANTS}
            onClick={() => a.addVariant()}
            title="Save the current camera and pose as a named shot"
          >
            + Save shot
          </button>
        </div>
      </div>
      {variants.length === 0 && <p className="text-neutral-500">Save 2–{MAX_VARIANTS} named camera + pose shots of this scene to compare them.</p>}
      {variants.map((v) => (
        <div key={v.id} className={`flex items-center gap-1 rounded px-1 py-0.5 ${v.id === active ? 'bg-sky-950/60' : ''}`}>
          {editing === v.id ? (
            <input
              autoFocus
              defaultValue={v.name}
              className="min-w-0 flex-1 rounded bg-neutral-800 px-1 text-neutral-200 outline-none"
              onBlur={(e) => {
                a.renameVariant(v.id, e.target.value)
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditing(null)
              }}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-neutral-200 hover:text-white"
              onClick={() => a.applyVariant(v.id)}
              onDoubleClick={() => setEditing(v.id)}
              title="Go to this shot (double-click to rename)"
            >
              {v.name}
            </button>
          )}
          <button type="button" className={smallBtn} onClick={() => a.updateVariant(v.id)} title="Overwrite with the current camera and pose">
            Update
          </button>
          <button type="button" className={smallBtn} disabled={variants.length >= MAX_VARIANTS} onClick={() => a.duplicateVariant(v.id)} title="Duplicate shot">
            ⧉
          </button>
          <button type="button" className={smallBtn} onClick={() => a.deleteVariant(v.id)} title="Delete shot">
            ✕
          </button>
        </div>
      ))}
      {compare && <CompareShots onClose={() => setCompare(false)} />}
    </section>
  )
}

function CompareShots({ onClose }: { onClose: () => void }) {
  const variants = useStore((s) => s.variants)
  const [urls, setUrls] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let made: string[] = []
    let live = true
    const handle = getViewportHandle()
    const s = appStore.getState()
    if (!handle) {
      setError('Viewport not ready')
      return
    }
    handle
      .renderShots(variants, {
        aspect: s.scene.canvasRatio,
        preset: LOOK_TO_PRESET[s.viewLook],
        options: {
          ...s.exportSettings.settings,
          widthPx: Math.round(THUMB_HEIGHT_PX * s.scene.canvasRatio),
          framing: 'viewport',
          grid: s.scene.grid,
          shadow: s.scene.groundShadow,
        },
      })
      .then((pngs) => {
        made = pngs.map((p) => URL.createObjectURL(new Blob([p.slice()], { type: 'image/png' })))
        if (live) setUrls(made)
        else made.forEach((u) => URL.revokeObjectURL(u))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [variants])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-6" onClick={onClose}>
      <div className="mb-3 flex items-center justify-between text-sm text-neutral-200">
        <span>Shots side by side · click a shot to go to it</span>
        <button type="button" className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700" onClick={onClose}>
          Close
        </button>
      </div>
      {error && <p className="text-red-300">{error}</p>}
      {!urls && !error && <p className="text-neutral-400">Rendering…</p>}
      {urls && (
        <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))` }}>
          {variants.map((v, i) => (
            <button
              key={v.id}
              type="button"
              className="flex min-h-0 flex-col items-center rounded border border-neutral-700 bg-[#3a3a3a] p-2 hover:border-sky-500"
              onClick={(e) => {
                e.stopPropagation()
                appStore.getState().applyVariant(v.id)
                onClose()
              }}
            >
              <img src={urls[i]} alt={v.name} className="min-h-0 flex-1 object-contain" />
              <span className="mt-1 text-xs text-neutral-200">
                {v.name} · {v.camera.focal.toFixed(0)} mm
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
