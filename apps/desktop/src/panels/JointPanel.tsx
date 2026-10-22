import { lockedJoints } from '../lib/poseOps'
import { degToRad, radToDeg } from '../lib/units'
import { JOINT_LIMITS } from '../solve/jointLimits'
import { isNudgeJoint, nudgeBlocked, NUDGE_STEP_M } from '../solve/depthNudge'
import { chainOf, IK_CHAINS } from '../solve/ik'
import { PART_LABEL, partOf } from '../solve/poseSolve'
import { useStore } from '../state/store'
import type { JointRotation } from '../types/scene'
import { LockButton } from '../ui/LockButton'
import { Section, smallBtn } from '../ui/Section'
import { Slider } from '../ui/Slider'

const AXES: readonly (keyof JointRotation)[] = ['rx', 'ry', 'rz']
const CM_PER_M = 100

export function JointPanel() {
  const joint = useStore((s) => s.selectedJoint)
  const pose = useStore((s) => s.pose)
  const setJointRotation = useStore((s) => s.setJointRotation)
  const resetJoint = useStore((s) => s.resetJoint)
  const toggleJointLock = useStore((s) => s.toggleJointLock)
  const endGesture = useStore((s) => s.endGesture)
  const nudgeJointDepth = useStore((s) => s.nudgeJointDepth)
  const clearDepthNudge = useStore((s) => s.clearDepthNudge)
  const resolvePart = useStore((s) => s.resolvePart)
  const poseSolved = useStore((s) => typeof s.sketch.solve.settings['pose'] === 'object')
  const conf = useStore((s) => (s.selectedJoint ? s.sketch.solve.confidence[s.selectedJoint] : undefined))
  const rot = joint ? pose.joints[joint] : null
  const locked = joint ? lockedJoints(pose).has(joint) : false
  const chain = joint ? chainOf(joint) : null
  const chainLocked = chain ? pose.ikLocks.includes(chain) : false

  return (
    <Section title="Selected joint">
      {joint && rot ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-amber-400">{joint}</span>
            <span className="flex items-center gap-1">
              <button type="button" className={smallBtn} disabled={locked} onClick={() => resetJoint(joint)}>
                Reset joint
              </button>
              <LockButton locked={pose.jointLocks.includes(joint)} onClick={() => toggleJointLock(joint)} />
            </span>
          </div>
          {chainLocked && chain && <p className="text-[11px] text-red-300">Locked with the {IK_CHAINS[chain].label.toLowerCase()} chain.</p>}
          {AXES.map((axis) => {
            const [lo, hi] = JOINT_LIMITS[joint][axis]
            return (
              <Slider
                key={axis}
                label={`${axis.toUpperCase()}  (limit ${Math.round(radToDeg(lo))}° to ${Math.round(radToDeg(hi))}°)`}
                value={rot[axis]}
                min={-180}
                max={180}
                step={1}
                unit="°"
                decimals={1}
                toDisplay={radToDeg}
                fromDisplay={degToRad}
                disabled={locked}
                onChange={(v, preview) => setJointRotation(joint, { ...rot, [axis]: v }, { preview })}
                onCommit={endGesture}
              />
            )
          })}
          <p className="text-[11px] text-neutral-500">The rotate gizmo and these sliders can go past limits; IK drags cannot.</p>
          {isNudgeJoint(joint) && (
            <div className="mt-2 space-y-1 border-t border-neutral-800 pt-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Depth nudge{conf ? ` · fit ${conf}` : ''}</span>
                <span className="text-neutral-200">
                  {((pose.depthNudges[joint] ?? 0) * CM_PER_M).toFixed(1)} cm
                </span>
              </div>
              <div className="flex items-center gap-1">
                {(
                  [
                    ['Nearer', -NUDGE_STEP_M],
                    ['Farther', NUDGE_STEP_M],
                  ] as const
                ).map(([label, d]) => (
                  <button
                    key={label}
                    type="button"
                    className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
                    disabled={nudgeBlocked(lockedJoints(pose), joint)}
                    onClick={() => nudgeJointDepth(joint, d)}
                  >
                    {label} {(NUDGE_STEP_M * CM_PER_M).toFixed(0)} cm
                  </button>
                ))}
                <button type="button" className={smallBtn} disabled={pose.depthNudges[joint] === undefined} onClick={() => clearDepthNudge(joint)}>
                  Clear
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">
                Moves the joint toward or away from the viewer, keeping bone lengths; also the cyan handles next to it in the viewport. Nudges are re-applied when
                this limb is re-solved.
              </p>
            </div>
          )}
          {poseSolved && (
            <button type="button" className={`${smallBtn} mt-1`} onClick={() => resolvePart(partOf(joint))}>
              Re-solve {PART_LABEL[partOf(joint)]} from the sketch
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Click a joint in the viewport, then drag the rotation rings.</p>
      )}
    </Section>
  )
}
