import type { FileResult } from '../export/sceneFile'
import { importSketch } from '../export/sketchFile'
import { MAX_SKETCH_SCALE, MIN_SKETCH_SCALE } from '../lib/sketchSpace'
import { degToRad, radToDeg } from '../lib/units'
import { useStore } from '../state/store'
import { chipBtn, Section, smallBtn } from '../ui/Section'
import { Slider } from '../ui/Slider'

/** Pan range of the sketch, in frame heights from the frame centre. */
const PAN_RANGE = 2

export function SketchPanel({ onResult }: { onResult: (r: FileResult) => void }) {
  const sketch = useStore((s) => s.sketch)
  const image = useStore((s) => (s.sketch.hash ? s.sketchImages[s.sketch.hash] : undefined))
  const view = useStore((s) => s.sketchView)
  const tool = useStore((s) => s.cueTool)
  const setView = useStore((s) => s.setSketchView)
  const setTool = useStore((s) => s.setCueTool)
  const setAlign = useStore((s) => s.setSketchAlignment)
  const resetAlign = useStore((s) => s.resetSketchAlignment)
  const removeSketch = useStore((s) => s.removeSketch)
  const endGesture = useStore((s) => s.endGesture)
  const message = useStore((s) => s.sketchMessage)

  const doImport = (): void => {
    void importSketch()
      .then(onResult)
      .catch((e: unknown) => onResult({ ok: false, message: e instanceof Error ? e.message : String(e) }))
  }
  const a = sketch.alignment
  const hasSketch = sketch.hash !== null

  return (
    <Section
      title="Sketch"
      actions={
        <>
          <button type="button" className={smallBtn} onClick={doImport}>
            {hasSketch ? 'Replace…' : 'Import…'}
          </button>
          {hasSketch && (
            <button type="button" className={smallBtn} onClick={removeSketch}>
              Remove
            </button>
          )}
        </>
      }
    >
      {!hasSketch && <p className="text-xs text-neutral-500">Import a PNG or JPG sketch to trace over and read perspective from.</p>}
      {hasSketch && (
        <div className="space-y-1 text-xs">
          <div className="truncate text-neutral-400" title={sketch.path ?? undefined}>
            {image ? image.name : (sketch.path ?? 'Sketch')} {sketch.size ? `· ${sketch.size.width}×${sketch.size.height}` : ''}
          </div>
          {!image && <p className="text-amber-400">The image is not loaded, so only the cues show. Import it again to see it.</p>}
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={chipBtn(view.visible)} onClick={() => setView({ visible: !view.visible })}>
              {view.visible ? 'Shown' : 'Hidden'}
            </button>
            <button
              type="button"
              className={chipBtn(view.locked)}
              onClick={() => setView({ locked: !view.locked })}
              title="Lock the sketch position, scale and rotation"
            >
              {view.locked ? 'Locked' : 'Unlocked'}
            </button>
            <button
              type="button"
              className={chipBtn(tool === 'move')}
              disabled={view.locked || view.traceLock}
              onClick={() => setTool(tool === 'move' ? 'none' : 'move')}
              title="Drag the sketch in the viewport"
            >
              Move
            </button>
            <button type="button" className={smallBtn} disabled={view.locked || view.traceLock} onClick={resetAlign}>
              Reset placement
            </button>
          </div>
          <Slider label="Opacity" value={view.opacity} min={0.05} max={1} step={0.01} onChange={(v) => setView({ opacity: v })} onCommit={() => undefined} />
          <Slider
            label="Scale"
            value={a.scale}
            min={MIN_SKETCH_SCALE}
            max={MAX_SKETCH_SCALE}
            step={0.01}
            unit="×"
            disabled={view.locked || view.traceLock}
            onChange={(v, p) => setAlign({ scale: v }, { preview: p })}
            onCommit={endGesture}
          />
          <Slider
            label="Rotate"
            value={a.rotation}
            min={-180}
            max={180}
            step={0.1}
            unit="°"
            decimals={1}
            toDisplay={radToDeg}
            fromDisplay={degToRad}
            disabled={view.locked || view.traceLock}
            onChange={(v, p) => setAlign({ rotation: v }, { preview: p })}
            onCommit={endGesture}
          />
          <Slider
            label="Pan X"
            value={a.x}
            min={-PAN_RANGE}
            max={PAN_RANGE}
            step={0.005}
            disabled={view.locked || view.traceLock}
            onChange={(v, p) => setAlign({ x: v }, { preview: p })}
            onCommit={endGesture}
          />
          <Slider
            label="Pan Y"
            value={a.y}
            min={-PAN_RANGE}
            max={PAN_RANGE}
            step={0.005}
            disabled={view.locked || view.traceLock}
            onChange={(v, p) => setAlign({ y: v }, { preview: p })}
            onCommit={endGesture}
          />
          <p className="text-neutral-500">Pan is in frame heights. The frame centre is taken as the sketch's optical centre.</p>
        </div>
      )}
      {message && <p className="mt-1 text-xs text-amber-400">{message}</p>}
    </Section>
  )
}
