// Depth nudge handles beside the selected joint: Near / Far steps, and a grip to drag the depth. Hovering a step
// shows the limb where it would go as a ghost; while dragging, the ghost shows where it started.
// The anchor is positioned by the viewport each frame (it follows the joint on screen). Viewport-only.
import { useEffect, useRef } from 'react'
import { isNudgeJoint, nudgeBlocked, nudgeLimb, NUDGE_STEP_M, type NudgeJoint } from '../solve/depthNudge'
import { lockedJoints } from '../lib/poseOps'
import { appStore, useStore } from '../state/store'
import { previewNudge } from '../state/sketchSlice'
import { CONFIDENCE_COLOR } from './LandmarkOverlay'

/** Dragging the grip by one pixel nudges this much depth (m); right = farther. */
const NUDGE_M_PER_PX = 0.002
const CM_PER_M = 100

export function NudgeHandles() {
  const joint = useStore((s) => s.selectedJoint)
  const nudge = useStore((s) => (s.selectedJoint ? s.pose.depthNudges[s.selectedJoint] : undefined))
  const locked = useStore((s) => s.selectedJoint !== null && isNudgeJoint(s.selectedJoint) && nudgeBlocked(lockedJoints(s.pose), s.selectedJoint))
  const conf = useStore((s) => (s.selectedJoint ? s.sketch.solve.confidence[s.selectedJoint] : undefined))
  const drag = useRef<{ x: number } | null>(null)
  // A ghost belongs to the joint it was shown for.
  useEffect(() => () => appStore.getState().setNudgeGhost(null), [joint])
  if (!joint || !isNudgeJoint(joint)) return null
  const j: NudgeJoint = joint

  const showGhost = (delta: number): void => {
    const s = appStore.getState()
    const pose = previewNudge(s, j, delta)
    s.setNudgeGhost(pose ? { pose, joints: nudgeLimb(j) } : null)
  }
  const clearGhost = (): void => appStore.getState().setNudgeGhost(null)
  const step = (delta: number): void => {
    appStore.getState().nudgeJointDepth(j, delta)
    showGhost(delta)
  }

  const btn = 'rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-800 disabled:opacity-40'
  return (
    <div
      className="pointer-events-auto flex items-center gap-1 rounded border border-cyan-700/70 bg-black/50 px-1 py-0.5 text-[11px] text-cyan-100 shadow"
      onPointerLeave={() => drag.current === null && clearGhost()}
    >
      <button type="button" className={btn} disabled={locked} title="Nudge nearer the viewer" onPointerEnter={() => showGhost(-NUDGE_STEP_M)} onClick={() => step(-NUDGE_STEP_M)}>
        ◂ Near
      </button>
      <span
        className={`cursor-ew-resize select-none rounded px-1.5 py-0.5 ${locked ? 'opacity-40' : 'bg-cyan-900/60 hover:bg-cyan-800'}`}
        title="Drag left (nearer) or right (farther)"
        onPointerDown={(e) => {
          if (locked) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX }
          const s = appStore.getState()
          s.setNudgeGhost({ pose: s.pose, joints: nudgeLimb(j) })
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          if (dx === 0) return
          drag.current = { x: e.clientX }
          appStore.getState().nudgeJointDepth(j, dx * NUDGE_M_PER_PX, { preview: true })
        }}
        onPointerUp={() => {
          if (!drag.current) return
          drag.current = null
          appStore.getState().endGesture()
          clearGhost()
        }}
      >
        ⇔ {nudge ? `${nudge > 0 ? '+' : ''}${(nudge * CM_PER_M).toFixed(1)} cm` : 'depth'}
      </span>
      <button type="button" className={btn} disabled={locked} title="Nudge farther from the viewer" onPointerEnter={() => showGhost(NUDGE_STEP_M)} onClick={() => step(NUDGE_STEP_M)}>
        Far ▸
      </button>
      {conf && <span className="ml-0.5 inline-block h-2 w-2 rounded-full" style={{ background: CONFIDENCE_COLOR[conf] }} title={`Fit to the drawing: ${conf}`} />}
    </div>
  )
}
