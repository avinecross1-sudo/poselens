// Viewport background: letterbox + frame colour and the sketch underlay. Sits behind the transparent WebGL canvas.
// In compare mode the sketch is drawn over the canvas instead (SketchOverlay), optionally as a difference tint.
// Viewport-only; never part of exported PNGs.
import { useRef, type CSSProperties } from 'react'
import { imageFrameSize } from '../lib/sketchSpace'
import { useStore } from '../state/store'
import type { SketchImage, SketchView } from '../state/types'
import type { SketchMeta } from '../types/scene'
import type { Rect } from '../lib/frameLayout'
import { useFrameRect } from './useFrameRect'

const EDITOR_BG = '#262626'
const LETTERBOX_BG = '#0a0a0a'
const SHOT_BG = '#3a3a3a'
/**
 * Difference tint: the drawing is inverted (paper turns black, so it leaves the render untouched under a difference
 * blend) and its lines are coloured, so they stand out in a complementary hue wherever they cross the mannequin.
 */
const DIFFERENCE_FILTER = 'invert(1) sepia(1) saturate(6) hue-rotate(260deg)'

function sketchImage(image: SketchImage, sketch: SketchMeta, ratio: number, rect: Rect, opacity: number, extra: CSSProperties = {}) {
  const a = sketch.alignment
  const box = imageFrameSize(image.width / image.height, ratio)
  const w = box.w * rect.height
  const h = box.h * rect.height
  const cx = rect.width / 2 + a.x * rect.height
  const cy = rect.height / 2 - a.y * rect.height
  return (
    <img
      src={image.url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        opacity,
        transformOrigin: '0 0',
        // Rotation is counter-clockwise in frame space (y up); CSS rotates clockwise.
        transform: `translate(${cx}px, ${cy}px) rotate(${-a.rotation}rad) scale(${a.scale}) translate(${-w / 2}px, ${-h / 2}px)`,
        userSelect: 'none',
        ...extra,
      }}
    />
  )
}

function useSketch(): { image: SketchImage | undefined; sketch: SketchMeta; view: SketchView; ratio: number; shot: boolean } {
  const shot = useStore((s) => s.activeCamera === 'shot')
  const ratio = useStore((s) => s.scene.canvasRatio)
  const sketch = useStore((s) => s.sketch)
  const view = useStore((s) => s.sketchView)
  const image = useStore((s) => (s.sketch.hash ? s.sketchImages[s.sketch.hash] : undefined))
  return { image, sketch, view, ratio, shot }
}

export function SketchLayer() {
  const ref = useRef<HTMLDivElement>(null)
  const { rect } = useFrameRect(ref)
  const { image, sketch, view, ratio, shot } = useSketch()
  const underlay = image && sketch.size && view.visible && !view.compare ? sketchImage(image, sketch, ratio, rect, view.opacity) : null

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: shot ? LETTERBOX_BG : EDITOR_BG }}>
      {shot && <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, background: SHOT_BG }} />}
      {/* In shot view the underlay is cropped to the frame, as the export will be. */}
      <div
        className="absolute"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, overflow: shot ? 'hidden' : 'visible' }}
      >
        {underlay}
      </div>
    </div>
  )
}

/** Compare mode: the sketch over the mannequin. Clicks pass through to the viewport. */
export function SketchOverlay() {
  const ref = useRef<HTMLDivElement>(null)
  const { rect } = useFrameRect(ref)
  const { image, sketch, view, ratio, shot } = useSketch()
  const on = image && sketch.size && view.visible && view.compare
  const blend: CSSProperties = view.difference ? { mixBlendMode: 'difference', filter: DIFFERENCE_FILTER } : {}
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden">
      {on && (
        <div className="absolute" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, overflow: shot ? 'hidden' : 'visible' }}>
          {sketchImage(image, sketch, ratio, rect, view.opacity, blend)}
        </div>
      )}
    </div>
  )
}
