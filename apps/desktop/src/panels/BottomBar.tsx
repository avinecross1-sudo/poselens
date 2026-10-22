import { loadScene, saveScene, type FileResult } from '../export/sceneFile'
import { useStore } from '../state/store'

const btn = 'rounded px-3 py-1 text-xs bg-neutral-800 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800'

export function BottomBar({ status, onResult }: { status: FileResult | null; onResult: (r: FileResult) => void }) {
  const past = useStore((s) => s.history.past)
  const future = useStore((s) => s.history.future)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  const run = (fn: () => Promise<FileResult>) => () =>
    void fn()
      .then(onResult)
      .catch((e: unknown) => onResult({ ok: false, message: e instanceof Error ? e.message : String(e) }))

  const lastUndo = past[past.length - 1]
  const nextRedo = future[0]

  return (
    <footer className="flex items-center gap-2 border-t border-neutral-800 bg-neutral-900 px-3 py-2">
      <button type="button" className={btn} disabled={!lastUndo} onClick={undo} title="Ctrl+Z">
        Undo{lastUndo ? `: ${lastUndo.label}` : ''}
      </button>
      <button type="button" className={btn} disabled={!nextRedo} onClick={redo} title="Ctrl+Shift+Z / Ctrl+Y">
        Redo{nextRedo ? `: ${nextRedo.label}` : ''}
      </button>
      <div className="mx-2 h-4 w-px bg-neutral-700" />
      <button type="button" className={btn} onClick={run(saveScene)} title="Ctrl+S">
        Save scene
      </button>
      <button type="button" className={btn} onClick={run(loadScene)} title="Ctrl+O">
        Load scene
      </button>
      {status && status.ok !== null && (
        <span className={`ml-auto truncate text-xs ${status.ok ? 'text-neutral-400' : 'text-red-400'}`}>{status.message}</span>
      )}
    </footer>
  )
}
