// Perspective cue layer over the viewport: horizon line, vanishing points, and the tools that place them.
// Cues live in image space (state); this component maps them to pixels through the sketch alignment.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { frameToImage, frameToPx, imageToFrame, pxToFrame } from '../lib/sketchSpace'
import { appStore, useStore } from '../state/store'
import { MAX_VPS, type Vec2 } from '../types/scene'
import { useFrameRect } from './useFrameRect'

const HORIZON_COLOR = '#fbbf24'
const VP_COLORS = ['#38bdf8', '#34d399', '#f472b6'] as const
const VP_LABELS = ['VP 1', 'VP 2', 'VP 3 (vertical)'] as const
const HANDLE_RADIUS_PX = 7
/** Off-screen cues get an edge marker this far inside the viewport. */
const EDGE_INSET_PX = 16
const FRAME_OUTLINE = '#737373'

type Drag = { kind: 'horizon'; index: 0 | 1 } | { kind: 'vp'; index: number } | { kind: 'sketch'; x0: number; y0: number; px: number; py: number }

export function CueOverlay() {
  const ref = useRef<SVGSVGElement>(null)
  const { width, height, rect } = useFrameRect(ref)
  const sketch = useStore((s) => s.sketch)
  const tool = useStore((s) => s.cueTool)
  const draft = useStore((s) => s.cueDraft)
  const view = useStore((s) => s.sketchView)
  const shot = useStore((s) => s.activeCamera === 'shot')
  const ratio = useStore((s) => s.scene.canvasRatio)
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const drag = useRef<Drag | null>(null)

  const size = sketch.size
  if (!size || !view.showCues) return <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />
  const imageAspect = size.width / size.height
  const a = sketch.alignment

  const toPx = (p: Vec2): Vec2 => frameToPx(imageToFrame(p, a, imageAspect, ratio), rect)
  const eventToImage = (e: ReactPointerEvent): Vec2 => {
    const b = ref.current?.getBoundingClientRect()
    const local: Vec2 = [e.clientX - (b?.left ?? 0), e.clientY - (b?.top ?? 0)]
    return frameToImage(pxToFrame(local, rect), a, imageAspect, ratio)
  }
  const eventToPx = (e: ReactPointerEvent): Vec2 => {
    const b = ref.current?.getBoundingClientRect()
    return [e.clientX - (b?.left ?? 0), e.clientY - (b?.top ?? 0)]
  }

  const st = (): ReturnType<typeof appStore.getState> => appStore.getState()

  // ---- Placement tools (a transparent sheet over the viewport while a tool is armed) ----
  const onSheetDown = (e: ReactPointerEvent<SVGRectElement>): void => {
    if (e.button !== 0) return
    if (tool === 'move') {
      if (view.locked) return
      e.currentTarget.setPointerCapture(e.pointerId)
      const [px, py] = eventToPx(e)
      drag.current = { kind: 'sketch', x0: a.x, y0: a.y, px, py }
      return
    }
    const p = eventToImage(e)
    if (tool === 'horizon') {
      if (!draft) st().setCueDraft(p)
      else {
        st().setHorizon([draft, p])
        st().setCueTool('none')
      }
    } else if (tool === 'vp') {
      st().addVp(p)
      if (st().sketch.vps.length >= MAX_VPS) st().setCueTool('none')
    }
  }
  const onSheetMove = (e: ReactPointerEvent<SVGRectElement>): void => {
    const d = drag.current
    if (d?.kind === 'sketch') {
      const [px, py] = eventToPx(e)
      st().setSketchAlignment({ x: d.x0 + (px - d.px) / rect.height, y: d.y0 - (py - d.py) / rect.height }, { preview: true })
    } else if (tool === 'horizon' && draft) setCursor(eventToPx(e))
  }
  const onSheetUp = (): void => {
    if (drag.current?.kind === 'sketch') st().endGesture()
    drag.current = null
  }

  // ---- Dragging placed handles ----
  const startHandle = (e: ReactPointerEvent<SVGElement>, d: Drag): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = d
  }
  const moveHandle = (e: ReactPointerEvent<SVGElement>): void => {
    const d = drag.current
    if (!d || d.kind === 'sketch') return
    const p = eventToImage(e)
    if (d.kind === 'horizon') st().setHorizonPoint(d.index, p, { preview: true })
    else st().moveVp(d.index, p, { preview: true })
  }
  const endHandle = (): void => {
    if (drag.current && drag.current.kind !== 'sketch') st().endGesture()
    drag.current = null
  }
  const handleProps = (d: Drag) => ({
    onPointerDown: (e: ReactPointerEvent<SVGElement>) => startHandle(e, d),
    onPointerMove: moveHandle,
    onPointerUp: endHandle,
    onPointerCancel: endHandle,
    style: { pointerEvents: tool === 'none' ? ('auto' as const) : ('none' as const), cursor: 'grab' },
  })

  // ---- Horizon line, extended across the viewport ----
  let horizonLine: { x1: number; y1: number; x2: number; y2: number } | null = null
  const hp = sketch.horizon ? [toPx(sketch.horizon[0]), toPx(sketch.horizon[1])] : null
  if (hp && hp[0] && hp[1]) {
    const dx = hp[1][0] - hp[0][0]
    const dy = hp[1][1] - hp[0][1]
    if (Math.abs(dx) > 1e-6) {
      const y = (x: number): number => hp[0]![1] + ((x - hp[0]![0]) * dy) / dx
      horizonLine = { x1: 0, y1: y(0), x2: width, y2: y(width) }
    }
  }

  const edgeMarker = (p: Vec2, label: string, color: string) => {
    const inside = p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height
    if (inside) return null
    const x = Math.min(width - EDGE_INSET_PX, Math.max(EDGE_INSET_PX, p[0]))
    const y = Math.min(height - EDGE_INSET_PX, Math.max(EDGE_INSET_PX, p[1]))
    return (
      <g key={`edge-${label}`} pointerEvents="none">
        <circle cx={x} cy={y} r={5} fill={color} opacity={0.85} />
        <text x={x} y={y - 9} fill={color} fontSize={11} textAnchor="middle">
          {label} off-screen
        </text>
      </g>
    )
  }

  // The landmark tool has its own layer (LandmarkOverlay).
  const armed = tool !== 'none' && tool !== 'landmark'
  const cursorStyle = tool === 'move' ? (view.locked ? 'not-allowed' : 'move') : 'crosshair'

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full select-none">
      {!shot && <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} fill="none" stroke={FRAME_OUTLINE} strokeDasharray="6 4" />}

      {horizonLine && <line {...horizonLine} stroke={HORIZON_COLOR} strokeWidth={1.5} pointerEvents="none" />}
      {hp?.map((p, i) =>
        p ? (
          <circle key={`h${i}`} cx={p[0]} cy={p[1]} r={HANDLE_RADIUS_PX} fill={HORIZON_COLOR} stroke="#000" strokeOpacity={0.6} {...handleProps({ kind: 'horizon', index: i as 0 | 1 })} />
        ) : null,
      )}
      {draft && (
        <g pointerEvents="none">
          <circle cx={toPx(draft)[0]} cy={toPx(draft)[1]} r={HANDLE_RADIUS_PX} fill={HORIZON_COLOR} opacity={0.7} />
          {cursor && <line x1={toPx(draft)[0]} y1={toPx(draft)[1]} x2={cursor[0]} y2={cursor[1]} stroke={HORIZON_COLOR} strokeDasharray="4 3" />}
        </g>
      )}

      {sketch.vps.map((v, i) => {
        const p = toPx(v)
        const color = VP_COLORS[i] ?? VP_COLORS[0]
        const label = VP_LABELS[i] ?? `VP ${i + 1}`
        return (
          <g key={`vp${i}`}>
            {edgeMarker(p, label, color)}
            <circle cx={p[0]} cy={p[1]} r={HANDLE_RADIUS_PX} fill={color} stroke="#000" strokeOpacity={0.6} {...handleProps({ kind: 'vp', index: i })} />
            <text x={p[0] + 11} y={p[1] - 9} fill={color} fontSize={11} pointerEvents="none">
              {label}
            </text>
          </g>
        )
      })}

      {armed && (
        <rect
          width={width}
          height={height}
          fill="transparent"
          style={{ pointerEvents: 'all', cursor: cursorStyle }}
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
        />
      )}
    </svg>
  )
}
