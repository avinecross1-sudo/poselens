// Copy / paste camera, body profile and pose between scenes. The clipboard survives loading another scene.
import { describeProvenance } from '../state/clipboardSlice'
import { useStore } from '../state/store'
import type { ClipboardState } from '../types/scene'

const ROWS: readonly { key: keyof ClipboardState; label: string; hint: string }[] = [
  { key: 'camera', label: 'Camera', hint: 'Whole shot camera: position, target, lens, roll' },
  { key: 'body', label: 'Body', hint: 'Body profile; pasting retargets the current pose onto it (locked sliders stay)' },
  { key: 'pose', label: 'Pose', hint: 'Pose, retargeted from the body it was copied from onto this one (locked joints stay)' },
]

const btn = 'rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40'

export function ClipboardPanel() {
  const clip = useStore((s) => s.clipboard)
  const customPresets = useStore((s) => s.customPresets)
  const traceLock = useStore((s) => s.sketchView.traceLock)
  const a = useStore((s) => s)
  const copy = { camera: a.copyCamera, body: a.copyBody, pose: a.copyPose }
  const paste = { camera: a.pasteCamera, body: a.pasteBody, pose: a.pastePose }
  return (
    <section className="space-y-1 text-xs">
      <h2 className="text-sm font-semibold text-neutral-200">Clipboard</h2>
      {ROWS.map((r) => {
        const entry = clip[r.key]
        const blocked = r.key === 'camera' && traceLock
        return (
          <div key={r.key} className="space-y-0.5">
            <div className="flex items-center gap-1" title={r.hint}>
              <span className="w-14 text-neutral-400">{r.label}</span>
              <button type="button" className={btn} onClick={copy[r.key]}>
                Copy
              </button>
              <button
                type="button"
                className={btn}
                disabled={!entry || blocked}
                onClick={() => paste[r.key]()}
                title={blocked ? 'Trace lock freezes the shot camera' : r.hint}
              >
                Paste
              </button>
            </div>
            {entry && <div className="pl-14 text-[11px] text-neutral-500">from {describeProvenance(entry.provenance, customPresets)}</div>}
          </div>
        )
      })}
    </section>
  )
}
