import { lockedJoints } from '../lib/poseOps'
import { degToRad, radToDeg } from '../lib/units'
import { JOINT_LIMITS } from '../solve/jointLimits'
import { chainOf, IK_CHAINS } from '../solve/ik'
import { useStore } from '../state/store'
import type { JointRotation } from '../types/scene'
import { LockButton } from '../ui/LockButton'
import { Section, smallBtn } from '../ui/Section'
import { Slider } from '../ui/Slider'

const AXES: readonly (keyof JointRotation)[] = ['rx', 'ry', 'rz']

export function JointPanel() {
  const joint = useStore((s) => s.selectedJoint)
  const pose = useStore((s) => s.pose)
  const setJointRotation = useStore((s) => s.setJointRotation)
  const resetJoint = useStore((s) => s.resetJoint)
  const toggleJointLock = useStore((s) => s.toggleJointLock)
  const endGesture = useStore((s) => s.endGesture)
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
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Click a joint in the viewport, then drag the rotation rings.</p>
      )}
    </Section>
  )
}
