import { useStore } from '../state/store'
import { chipBtn, Section } from '../ui/Section'
import { Slider } from '../ui/Slider'

/** Sketch compare mode: overlay, difference tint, opacity and trace lock. View settings only; not saved. */
export function ComparePanel() {
  const hasImage = useStore((s) => s.sketch.hash !== null && s.sketchImages[s.sketch.hash] !== undefined)
  const view = useStore((s) => s.sketchView)
  const setView = useStore((s) => s.setSketchView)
  if (!hasImage) return null

  return (
    <Section title="Compare">
      <div className="space-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className={chipBtn(view.compare)}
            onClick={() => setView({ compare: !view.compare, visible: true })}
            title="Draw the sketch over the mannequin instead of under it"
          >
            {view.compare ? 'Overlay on' : 'Overlay off'}
          </button>
          <button
            type="button"
            className={chipBtn(view.difference)}
            disabled={!view.compare}
            onClick={() => setView({ difference: !view.difference })}
            title="Tint the lines and difference-blend them, so where drawing and mannequin disagree stands out"
          >
            Difference tint
          </button>
          <button
            type="button"
            className={chipBtn(view.traceLock)}
            onClick={() => setView({ traceLock: !view.traceLock })}
            title="Freeze the shot camera and the sketch placement while you pose over the drawing"
          >
            {view.traceLock ? 'Trace locked' : 'Trace lock'}
          </button>
        </div>
        <Slider label="Opacity" value={view.opacity} min={0.05} max={1} step={0.01} onChange={(v) => setView({ opacity: v })} onCommit={() => undefined} />
        {view.traceLock && (
          <p className="text-amber-300">Trace lock: the shot camera and the sketch placement are frozen, so the drawing stays lined up while you pose.</p>
        )}
        <p className="text-neutral-500">
          Overlay draws the sketch on top of the mannequin; clicks still reach the joints. With difference tint, lines show in a contrasting colour wherever they
          cross the figure. Viewport only.
        </p>
      </div>
    </Section>
  )
}
