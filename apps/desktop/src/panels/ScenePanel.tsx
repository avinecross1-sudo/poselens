// Scene tags and notes (saved with the scene) and Duplicate scene.
import { useStore } from '../state/store'
import { NotesField, TagEditor } from '../ui/TagEditor'
import { smallBtn } from '../ui/Section'

export function ScenePanel() {
  const meta = useStore((s) => s.meta)
  const sceneName = useStore((s) => s.sceneName)
  const a = useStore((s) => s)
  return (
    <section className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Scene</h2>
        <button type="button" className={smallBtn} onClick={a.duplicateScene} title="Keep working on a copy of this scene under a new name (fresh undo history)">
          Duplicate scene
        </button>
      </div>
      <label className="block">
        <span className="text-neutral-400">Name</span>
        <input
          className="mt-0.5 w-full rounded bg-neutral-800 px-2 py-1 text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
          value={sceneName}
          onChange={(e) => a.setSceneName(e.target.value)}
        />
      </label>
      <TagEditor tags={meta.tags} onAdd={a.addSceneTag} onRemove={a.removeSceneTag} placeholder="Add scene tag" />
      <NotesField value={meta.notes} onChange={(v) => a.setSceneNotes(v, { preview: true })} onBlur={a.endGesture} placeholder="Scene notes" />
    </section>
  )
}
