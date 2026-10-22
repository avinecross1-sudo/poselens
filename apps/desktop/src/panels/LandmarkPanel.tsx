import { useState } from 'react'
import { CONFIDENCE_COLOR } from '../three/LandmarkOverlay'
import { LANDMARK_IDS, LANDMARKS, nextLandmark, OPTIONAL_LANDMARKS, REQUIRED_LANDMARKS, type DepthHint, type LandmarkId } from '../solve/landmarks'
import { LIMB_IDS, SOLVE_PARTS, type LimbId, type SolvePart } from '../solve/poseSolve'
import { useStore } from '../state/store'
import type { ConfidenceLevel } from '../types/scene'
import { ReviewNext } from '../ui/ReviewNext'
import { chipBtn, Section, smallBtn } from '../ui/Section'

const LIMB_LABEL: Record<LimbId, string> = { torso: 'Torso', head: 'Head', armL: 'L arm', armR: 'R arm', legL: 'L leg', legR: 'R leg' }
const HINT_LABEL: Record<DepthHint, string> = { toward: 'Near', away: 'Far' }
const PART_BUTTON: Record<SolvePart, string> = { torso: 'Torso', armL: 'L arm', armR: 'R arm', legL: 'L leg', legR: 'R leg' }
/** Worst limb confidence shown on a part's re-solve button (the torso part covers torso and head). */
const PART_LIMBS: Record<SolvePart, readonly LimbId[]> = { torso: ['torso', 'head'], armL: ['armL'], armR: ['armR'], legL: ['legL'], legR: ['legR'] }
const SEVERITY: readonly ConfidenceLevel[] = ['green', 'yellow', 'red']
const worstOf = (cs: readonly (ConfidenceLevel | undefined)[]): ConfidenceLevel | undefined =>
  cs.reduce<ConfidenceLevel | undefined>((a, c) => (c && (!a || SEVERITY.indexOf(c) > SEVERITY.indexOf(a)) ? c : a), undefined)

const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function LandmarkPanel() {
  const sketch = useStore((s) => s.sketch)
  const hasImage = useStore((s) => s.sketch.hash !== null && s.sketchImages[s.sketch.hash] !== undefined)
  const active = useStore((s) => s.activeLandmark)
  const setActive = useStore((s) => s.setActiveLandmark)
  const removeLandmark = useStore((s) => s.removeLandmark)
  const clearLandmarks = useStore((s) => s.clearLandmarks)
  const setDepthHint = useStore((s) => s.setDepthHint)
  const feetOnGround = useStore((s) => s.feetOnGround)
  const setFeetOnGround = useStore((s) => s.setFeetOnGround)
  const solve = useStore((s) => s.solvePoseFromSketch)
  const resolvePart = useStore((s) => s.resolvePart)
  const bakeSolve = useStore((s) => s.bakeSolve)
  const message = useStore((s) => s.sketchMessage)
  const [confirmBake, setConfirmBake] = useState(false)

  const hasSketch = sketch.hash !== null
  const lm = sketch.landmarks
  const placedRequired = REQUIRED_LANDMARKS.filter((id) => lm[id] !== undefined).length
  const anyPlaced = LANDMARK_IDS.some((id) => lm[id] !== undefined)
  const canSolve = lm['hipL'] !== undefined && lm['hipR'] !== undefined && (lm['neck'] !== undefined || (lm['shoulderL'] !== undefined && lm['shoulderR'] !== undefined))
  const conf = sketch.solve.confidence
  const rec = record(sketch.solve.settings['pose'])
  const solved = Object.keys(rec).length > 0
  const warnings = strings(rec['warnings'])
  const ambiguous = new Set(strings(rec['ambiguous']))
  const marking = active !== null

  const row = (id: LandmarkId) => {
    const def = LANDMARKS[id]
    const placed = lm[id] !== undefined
    const c: ConfidenceLevel | undefined = id === 'gaze' ? undefined : conf[def.joint]
    const hint = sketch.depthHints[id]
    return (
      <li key={id} className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${id === active ? 'bg-sky-900/60' : 'bg-neutral-800/50'}`}>
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-500"
          style={{ background: placed ? (c ? CONFIDENCE_COLOR[c] : '#e5e5e5') : 'transparent' }}
        />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-neutral-200 hover:text-white disabled:opacity-40"
          title={def.hint}
          disabled={!hasImage}
          onClick={() => setActive(id === active ? null : id)}
        >
          {def.label}
          {ambiguous.has(def.joint) && placed && id !== 'gaze' ? <span className="text-amber-400"> ?</span> : null}
        </button>
        {placed && def.depthHint && (
          <span className="flex shrink-0 gap-0.5" title="Is this joint nearer the viewer than the one it hangs from, or farther?">
            {(['toward', 'away'] as const).map((h) => (
              <button
                key={h}
                type="button"
                className={`rounded px-1 text-[10px] ${hint === h ? 'bg-violet-600 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}
                onClick={() => setDepthHint(id, hint === h ? null : h)}
              >
                {HINT_LABEL[h]}
              </button>
            ))}
          </span>
        )}
        {placed && (
          <button type="button" className={smallBtn} onClick={() => removeLandmark(id)} title="Remove">
            ×
          </button>
        )}
      </li>
    )
  }

  return (
    <Section
      title="Landmarks & pose solve"
      actions={
        anyPlaced && (
          <button type="button" className={smallBtn} onClick={clearLandmarks}>
            Clear
          </button>
        )
      }
    >
      {!hasSketch && <p className="text-xs text-neutral-500">Import a sketch to mark the figure's joints and solve a pose from them.</p>}
      {hasSketch && (
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={chipBtn(marking)}
              disabled={!hasImage}
              onClick={() => setActive(marking ? null : (nextLandmark(lm) ?? 'head'))}
            >
              {marking ? 'Stop marking' : placedRequired === 0 ? 'Start marking' : 'Continue marking'}
            </button>
            <span className="text-neutral-400">
              {placedRequired}/{REQUIRED_LANDMARKS.length} joints
            </span>
          </div>
          {!hasImage && <p className="text-amber-400">Import the sketch image again to place landmarks.</p>}
          <p className="text-neutral-500">
            Click each joint in turn; the next one is picked for you. Click a name to redo it, drag a marker to refine. Near / Far says whether a joint is nearer the
            viewer than the one it hangs from; it settles limbs that could point either way.
          </p>
          <ul className="space-y-0.5">{REQUIRED_LANDMARKS.map(row)}</ul>
          <div className="text-neutral-500">Optional</div>
          <ul className="space-y-0.5">{OPTIONAL_LANDMARKS.map(row)}</ul>

          <label className="flex items-center gap-1 text-neutral-300" title="Off for a jump or a fall: the figure keeps its height relative to the camera.">
            <input type="checkbox" checked={feetOnGround} onChange={(e) => setFeetOnGround(e.target.checked)} />
            Feet on the ground (sets the camera height)
          </label>
          <button
            type="button"
            className="w-full rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-500 disabled:opacity-40"
            disabled={!canSolve}
            onClick={() => {
              setActive(null)
              solve()
            }}
          >
            Solve pose
          </button>
          <p className="text-neutral-500">
            Needs both hips and the neck (or both shoulders). Also solves the camera from the perspective cues if they have changed. The pose stays fully editable,
            and one Undo restores everything as it was.
          </p>
          {message && <p className="text-red-400">{message}</p>}

          {solved && (
            <div className="space-y-1.5 rounded border border-neutral-700 p-2">
              <div className="flex flex-wrap gap-1">
                {LIMB_IDS.map((l) => {
                  const c = conf[l]
                  return (
                    <span key={l} className="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c ? CONFIDENCE_COLOR[c] : '#525252' }} />
                      {LIMB_LABEL[l]}
                    </span>
                  )
                })}
              </div>
              <p className="text-neutral-500">Green: within 2 cm of the drawing. Yellow: within 8 cm or out of reach. Red: further. Grey: not marked.</p>
              <ReviewNext />
              <div className="space-y-1 border-t border-neutral-800 pt-1.5">
                <div className="text-neutral-400">Re-solve one part</div>
                <div className="flex flex-wrap gap-1">
                  {SOLVE_PARTS.map((p) => {
                    const worst = worstOf(PART_LIMBS[p].map((l) => conf[l]))
                    return (
                      <button key={p} type="button" className="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 hover:bg-neutral-700" onClick={() => resolvePart(p)}>
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: worst ? CONFIDENCE_COLOR[worst] : '#525252' }} />
                        {PART_BUTTON[p]}
                      </button>
                    )
                  })}
                </div>
                <p className="text-neutral-500">
                  Re-fits only that part to its landmarks through the current camera. Everything else, locked joints and the camera stay as they are. One Undo step.
                </p>
              </div>
              <div className="space-y-1 border-t border-neutral-800 pt-1.5">
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1 ${confirmBake ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}`}
                  onBlur={() => setConfirmBake(false)}
                  onClick={() => {
                    if (!confirmBake) {
                      setConfirmBake(true)
                      return
                    }
                    setConfirmBake(false)
                    bakeSolve()
                  }}
                >
                  {confirmBake ? 'Click again to bake (cannot be undone)' : 'Bake solve to manual pose'}
                </button>
                <p className="text-neutral-500">
                  Keeps the pose and camera as they are now, clears the solve status and confidence, and removes the solve steps from Undo. The landmarks stay.
                </p>
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
