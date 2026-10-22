// Landmark layer over the viewport: placed landmarks as a stick figure, the guided placement tool, and
// dragging to refine. Landmarks live in image space (state) and move with the sketch alignment.
// After a pose solve each marker takes its joint's confidence colour (green / yellow / red).
import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { frameToImage, frameToPx, imageToFrame, pxToFrame } from '../lib/sketchSpace'
import { isLandmarkId, LANDMARK_BONES, LANDMARKS, nextLandmark, type LandmarkId } from '../solve/landmarks'
import { appStore, useStore } from '../state/store'
import type { ConfidenceLevel, Vec2 } from '../types/scene'
import { useFrameRect } from './useFrameRect'

const MARKER_RADIUS_PX = 5
const ACTIVE_RING_PX = 9
const UNSOLVED_COLOR = '#e5e5e5'
const BONE_COLOR = '#a78bfa'
const ACTIVE_COLOR = '#38bdf8'
export const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = { green: '#22c55e', yellow: '#facc15', red: '#ef4444' }
const AMBIGUOUS_MARK = '?'

/** Short marker labels (the panel shows the full names). */
const SHORT: Record<LandmarkId, string> = {
  head: 'crown',
  chin: 'chin',
  neck: 'neck',
  shoulderL: 'L sh',
  shoulderR: 'R sh',
  elbowL: 'L el',
  elbowR: 'R el',
  wristL: 'L wr',
  wristR: 'R wr',
  hipL: 'L hip',
  hipR: 'R hip',
  kneeL: 'L kn',
  kneeR: 'R kn',
  ankleL: 'L an',
  ankleR: 'R an',
  toeL: 'L toe',
  toeR: 'R toe',
  chest: 'chest',
  waist: 'waist',
  gaze: 'gaze',
}

export function LandmarkOverlay() {
  const ref = useRef<SVGSVGElement>(null)
  const { width, height, rect } = useFrameRect(ref)
  const sketch = useStore((s) => s.sketch)
  const tool = useStore((s) => s.cueTool)
  const active = useStore((s) => s.activeLandmark)
  const view = useStore((s) => s.sketchView)
  const ratio = useStore((s) => s.scene.canvasRatio)
  const dragging = useRef<LandmarkId | null>(null)

  const size = sketch.size
  if (!size || !view.showCues) return <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />
  const imageAspect = size.width / size.height
  const a = sketch.alignment
  const toPx = (p: Vec2): Vec2 => frameToPx(imageToFrame(p, a, imageAspect, ratio), rect)
  const eventToImage = (e: ReactPointerEvent): Vec2 => {
    const b = ref.current?.getBoundingClientRect()
    return frameToImage(pxToFrame([e.clientX - (b?.left ?? 0), e.clientY - (b?.top ?? 0)], rect), a, imageAspect, ratio)
  }
  const st = (): ReturnType<typeof appStore.getState> => appStore.getState()

  const onSheetDown = (e: ReactPointerEvent<SVGRectElement>): void => {
    if (e.button !== 0 || !active) return
    st().setLandmark(active, eventToImage(e))
    // Guided order: move on to the next landmark still missing.
    st().setActiveLandmark(nextLandmark(st().sketch.landmarks, active))
  }

  const startDrag = (e: ReactPointerEvent<SVGElement>, id: LandmarkId): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = id
  }
  const moveDrag = (e: ReactPointerEvent<SVGElement>): void => {
    const id = dragging.current
    if (id) st().setLandmark(id, eventToImage(e), { preview: true })
  }
  const endDrag = (): void => {
    if (dragging.current) st().endGesture()
    dragging.current = null
  }

  const placed = Object.entries(sketch.landmarks).filter((e): e is [LandmarkId, Vec2] => isLandmarkId(e[0]))
  const px = Object.fromEntries(placed.map(([id, p]) => [id, toPx(p)])) as Partial<Record<LandmarkId, Vec2>>
  const conf = sketch.solve.confidence
  const settingsPose = sketch.solve.settings['pose']
  const ambiguous = new Set(
    typeof settingsPose === 'object' && settingsPose !== null && Array.isArray((settingsPose as Record<string, unknown>)['ambiguous'])
      ? ((settingsPose as Record<string, unknown>)['ambiguous'] as unknown[]).filter((j): j is string => typeof j === 'string')
      : [],
  )
  const colorOf = (id: LandmarkId): string => {
    const c = conf[LANDMARKS[id].joint]
    return id !== 'gaze' && c ? CONFIDENCE_COLOR[c] : UNSOLVED_COLOR
  }

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full select-none">
      {/* Placement sheet under the markers, so a click on a marker drags it instead of placing. */}
      {tool === 'landmark' && active && (
            <rect width={width} height={height} fill="transparent" style={{ pointerEvents: 'all', cursor: 'crosshair' }} onPointerDown={onSheetDown} />
      )}
      {LANDMARK_BONES.map(([p, q]) => {
        const a1 = px[p]
        const b1 = px[q]
        return a1 && b1 ? <line key={`${p}-${q}`} x1={a1[0]} y1={a1[1]} x2={b1[0]} y2={b1[1]} stroke={BONE_COLOR} strokeWidth={1.5} strokeOpacity={0.8} /> : null
      })}
      {px.head && px.gaze && <line x1={px.head[0]} y1={px.head[1]} x2={px.gaze[0]} y2={px.gaze[1]} stroke={BONE_COLOR} strokeDasharray="3 3" />}
      {placed.map(([id]) => {
        const p = px[id] as Vec2
        const isActive = id === active
        return (
          <g key={id}>
            {isActive && <circle cx={p[0]} cy={p[1]} r={ACTIVE_RING_PX} fill="none" stroke={ACTIVE_COLOR} strokeWidth={2} />}
            <circle
              cx={p[0]}
              cy={p[1]}
              r={MARKER_RADIUS_PX}
              fill={colorOf(id)}
              stroke="#000"
              strokeOpacity={0.7}
              onPointerDown={(e) => startDrag(e, id)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ pointerEvents: tool === 'none' || tool === 'landmark' ? 'auto' : 'none', cursor: 'grab' }}
            >
              <title>{LANDMARKS[id].label}</title>
            </circle>
            <text x={p[0] + 8} y={p[1] - 6} fill={colorOf(id)} fontSize={10} pointerEvents="none" paintOrder="stroke" stroke="#000" strokeWidth={2.5}>
              {SHORT[id]}
              {ambiguous.has(LANDMARKS[id].joint) ? ` ${AMBIGUOUS_MARK}` : ''}
            </text>
          </g>
        )
      })}
      {tool === 'landmark' && active && (
        <>
          <g pointerEvents="none">
            <rect x={width / 2 - 170} y={height - 64} width={340} height={40} rx={6} fill="#000" fillOpacity={0.7} />
            <text x={width / 2} y={height - 47} fill={ACTIVE_COLOR} fontSize={13} textAnchor="middle">
              Click: {LANDMARKS[active].label}
            </text>
            <text x={width / 2} y={height - 31} fill="#d4d4d4" fontSize={11} textAnchor="middle">
              {LANDMARKS[active].hint}
            </text>
          </g>
        </>
      )}
    </svg>
  )
}
