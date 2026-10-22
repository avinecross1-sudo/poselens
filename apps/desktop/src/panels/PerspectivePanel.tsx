import { radToDeg } from '../lib/units'
import { useStore } from '../state/store'
import { MAX_VPS, type ConfidenceLevel } from '../types/scene'
import { chipBtn, Section, smallBtn } from '../ui/Section'

const VP_NAMES = ['VP 1 (horizontal)', 'VP 2 (horizontal)', 'VP 3 (vertical)'] as const
const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  green: 'bg-emerald-700 text-emerald-100',
  yellow: 'bg-amber-700 text-amber-100',
  red: 'bg-red-800 text-red-100',
}
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { green: 'Consistent', yellow: 'Check', red: 'Inconsistent' }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const range = (v: unknown): [number, number] | null => {
  if (!Array.isArray(v) || v.length !== 2) return null
  const lo = num(v[0])
  const hi = num(v[1])
  return lo !== null && hi !== null ? [lo, hi] : null
}

export function PerspectivePanel() {
  const sketch = useStore((s) => s.sketch)
  const hasImage = useStore((s) => s.sketch.hash !== null && s.sketchImages[s.sketch.hash] !== undefined)
  const tool = useStore((s) => s.cueTool)
  const draft = useStore((s) => s.cueDraft)
  const view = useStore((s) => s.sketchView)
  const setView = useStore((s) => s.setSketchView)
  const setTool = useStore((s) => s.setCueTool)
  const setHorizon = useStore((s) => s.setHorizon)
  const removeVp = useStore((s) => s.removeVp)
  const clearCues = useStore((s) => s.clearCues)
  const solve = useStore((s) => s.solveCameraFromSketch)
  const message = useStore((s) => s.sketchMessage)

  const hasSketch = sketch.hash !== null
  const canPlace = hasSketch && hasImage
  const hasCues = sketch.horizon !== null || sketch.vps.length > 0
  const conf = sketch.solve.confidence['camera']
  const st = sketch.solve.settings
  const pitch = num(st['pitch'])
  const roll = num(st['roll'])
  const focal = num(st['focalMm'])
  const focalRange = range(st['focalRangeMm'])
  const focalSolved = st['focalSolved'] === true
  const warnings = Array.isArray(st['warnings']) ? st['warnings'].filter((w): w is string => typeof w === 'string') : []

  return (
    <Section
      title="Perspective cues"
      actions={
        hasCues && (
          <button type="button" className={smallBtn} onClick={clearCues}>
            Clear
          </button>
        )
      }
    >
      {!hasSketch && <p className="text-xs text-neutral-500">Import a sketch to place a horizon and vanishing points.</p>}
      {hasSketch && (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={chipBtn(tool === 'horizon')}
              disabled={!canPlace}
              onClick={() => setTool(tool === 'horizon' ? 'none' : 'horizon')}
            >
              {tool === 'horizon' ? (draft ? 'Click 2nd point…' : 'Click 1st point…') : sketch.horizon ? 'Redraw horizon' : 'Place horizon'}
            </button>
            <button
              type="button"
              className={chipBtn(tool === 'vp')}
              disabled={!canPlace || sketch.vps.length >= MAX_VPS}
              onClick={() => setTool(tool === 'vp' ? 'none' : 'vp')}
            >
              {tool === 'vp' ? 'Click to place VP…' : `Add VP (${sketch.vps.length}/${MAX_VPS})`}
            </button>
            <label className="ml-auto flex items-center gap-1 text-neutral-400">
              <input type="checkbox" checked={view.showCues} onChange={(e) => setView({ showCues: e.target.checked })} />
              Show
            </label>
          </div>
          {!canPlace && <p className="text-amber-400">Import the sketch image again to place cues.</p>}
          <p className="text-neutral-500">
            Horizon: two points. VP 1 and VP 2 are orthogonal horizontal directions; VP 3 is vertical. Shrink the sketch to reach VPs far outside it, then drag
            any marker to refine.
          </p>

          <ul className="space-y-0.5">
            {sketch.horizon && (
              <li className="flex items-center justify-between rounded bg-neutral-800/60 px-2 py-1">
                <span className="text-amber-300">Horizon</span>
                <button type="button" className={smallBtn} onClick={() => setHorizon(null)}>
                  Remove
                </button>
              </li>
            )}
            {sketch.vps.map((_, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-neutral-800/60 px-2 py-1">
                <span className="text-neutral-200">{VP_NAMES[i]}</span>
                <button type="button" className={smallBtn} onClick={() => removeVp(i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="w-full rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500 disabled:opacity-40"
            disabled={!hasCues}
            onClick={() => solve()}
          >
            Solve camera
          </button>
          <p className="text-neutral-500">Sets the shot camera pitch, roll and focal length. It stays fully editable, and Undo restores the previous camera.</p>
          {message && <p className="text-red-400">{message}</p>}

          {conf !== undefined && pitch !== null && roll !== null && focal !== null && (
            <div className="space-y-1 rounded border border-neutral-700 p-2">
              <div className="flex items-center justify-between">
                <span className="text-neutral-300">Last solve</span>
                <span className={`rounded px-1.5 py-0.5 ${CONFIDENCE_STYLE[conf]}`}>{CONFIDENCE_LABEL[conf]}</span>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 text-neutral-400">
                <span>Pitch</span>
                <span className="text-neutral-200">{radToDeg(pitch).toFixed(1)}°</span>
                <span>Roll</span>
                <span className="text-neutral-200">{radToDeg(roll).toFixed(1)}°</span>
                <span>Focal</span>
                <span className="text-neutral-200">
                  {focal.toFixed(0)} mm{focalSolved && focalRange ? ` (${focalRange[0].toFixed(0)}–${focalRange[1].toFixed(0)})` : ''}
                </span>
                {!focalSolved && focalRange && (
                  <>
                    <span>Suggested</span>
                    <span className="text-neutral-200">
                      {focalRange[0].toFixed(0)}–{focalRange[1].toFixed(0)} mm
                    </span>
                  </>
                )}
              </div>
              {warnings.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-amber-400">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
