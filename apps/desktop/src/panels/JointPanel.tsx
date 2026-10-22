import { degToRad, radToDeg } from '../lib/units'
import { useStore } from '../state/store'
import type { JointRotation } from '../types/scene'
import { Slider } from '../ui/Slider'

const AXES: readonly (keyof JointRotation)[] = ['rx', 'ry', 'rz']

export function JointPanel() {
  const joint = useStore((s) => s.selectedJoint)
  const rot = useStore((s) => (s.selectedJoint ? s.pose.joints[s.selectedJoint] : null))
  const setJointRotation = useStore((s) => s.setJointRotation)
  const resetJoint = useStore((s) => s.resetJoint)
  const resetPose = useStore((s) => s.resetPose)
  const endGesture = useStore((s) => s.endGesture)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Pose</h2>
        <button type="button" className="text-xs text-neutral-400 hover:text-white" onClick={resetPose}>
          Reset pose
        </button>
      </div>
      {joint && rot ? (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-amber-400">{joint}</span>
            <button type="button" className="text-neutral-400 hover:text-white" onClick={() => resetJoint(joint)}>
              Reset joint
            </button>
          </div>
          {AXES.map((axis) => (
            <Slider
              key={axis}
              label={axis.toUpperCase()}
              value={rot[axis]}
              min={-180}
              max={180}
              step={1}
              unit="°"
              decimals={1}
              toDisplay={radToDeg}
              fromDisplay={degToRad}
              onChange={(v, preview) => setJointRotation(joint, { ...rot, [axis]: v }, { preview })}
              onCommit={endGesture}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500">Click a joint in the viewport, then drag the rotation rings.</p>
      )}
    </section>
  )
}
