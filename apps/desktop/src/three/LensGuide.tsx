// Wide-lens distortion preview: below 24 mm the shot view shows rings where round forms stretch by 10%, 25% and 50%,
// and names the head, hands or feet that sit in the strongly stretched zone. Viewport-only.
import { useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import { lensGuide, STRETCH_LEVELS } from '../lib/lens'
import { posePositions } from '../solve/fk'
import { cameraModel, project } from '../solve/projection'
import { rigOf, stylizeOf } from '../state/rigOf'
import { useStore } from '../state/store'
import type { JointName } from '../types/scene'
import { useFrameRect } from './useFrameRect'

const RING_COLORS: Record<(typeof STRETCH_LEVELS)[number], string> = { 1.1: '#facc15', 1.25: '#fb923c', 1.5: '#ef4444' }
/** Parts named when they sit past the middle ring. */
const WATCHED: readonly { joint: JointName; label: string }[] = [
  { joint: 'head', label: 'head' },
  { joint: 'handL', label: 'left hand' },
  { joint: 'handR', label: 'right hand' },
  { joint: 'footL', label: 'left foot' },
  { joint: 'footR', label: 'right foot' },
]
const WATCH_LEVEL = STRETCH_LEVELS[1]

export function LensGuide() {
  const ref = useRef<HTMLDivElement>(null)
  const { rect } = useFrameRect(ref)
  const camera = useStore((s) => s.camera)
  const ratio = useStore((s) => s.scene.canvasRatio)
  const on = useStore((s) => s.overlays.lensGuide)
  const shot = useStore((s) => s.activeCamera === 'shot')
  const body = useStore((s) => s.body)
  const pose = useStore((s) => s.pose)
  const guide = lensGuide(camera.focal, camera.sensorHeight, ratio)

  const stretched = useMemo(() => {
    if (!guide.wide) return []
    const limit = guide.rings.find((r) => r.level === WATCH_LEVEL)?.radius ?? Infinity
    const cam = cameraModel(camera)
    const world = posePositions(rigOf(body), pose, stylizeOf(body))
    return WATCHED.filter(({ joint }) => {
      const p = project(cam, new Vector3().setFromMatrixPosition(world[joint]))
      // Frame units are frame heights from the centre; rings are in half-frame-heights.
      return p !== null && Math.hypot(p[0], p[1]) * 2 > limit
    }).map((w) => w.label)
  }, [guide.wide, guide.rings, camera, body, pose])

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {on && guide.wide && shot && (
        <svg className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
          {guide.rings.map((r) => (
            <circle
              key={r.level}
              cx={rect.width / 2}
              cy={rect.height / 2}
              r={(r.radius * rect.height) / 2}
              fill="none"
              stroke={RING_COLORS[r.level as keyof typeof RING_COLORS] ?? '#ef4444'}
              strokeOpacity={0.7}
              strokeDasharray="6 5"
            />
          ))}
          {guide.rings.map((r) => (
            <text
              key={`t${r.level}`}
              x={rect.width / 2 + (r.radius * rect.height) / 2 / Math.SQRT2 + 4}
              y={rect.height / 2 - (r.radius * rect.height) / 2 / Math.SQRT2 - 4}
              fill={RING_COLORS[r.level as keyof typeof RING_COLORS] ?? '#ef4444'}
              fontSize={11}
            >
              ×{r.level}
            </text>
          ))}
        </svg>
      )}
      {on && guide.wide && (
        <div className="absolute left-1/2 top-12 -translate-x-1/2 rounded bg-orange-950/85 px-2 py-1 text-xs text-orange-100">
          Wide lens {camera.focal.toFixed(0)} mm: forms stretch toward the frame edge (corners ×{guide.cornerStretch.toFixed(2)})
          {stretched.length > 0 && <> · stretched: {stretched.join(', ')}</>}
        </div>
      )}
    </div>
  )
}
