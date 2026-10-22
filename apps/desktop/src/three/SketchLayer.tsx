// Viewport background: letterbox + frame colour and the sketch underlay. Sits behind the transparent WebGL canvas.
// Viewport-only; never part of exported PNGs.
import { useRef } from 'react'
import { imageFrameSize } from '../lib/sketchSpace'
import { useStore } from '../state/store'
import { useFrameRect } from './useFrameRect'

const EDITOR_BG = '#262626'
const LETTERBOX_BG = '#0a0a0a'
const SHOT_BG = '#3a3a3a'

export function SketchLayer() {
  const ref = useRef<HTMLDivElement>(null)
  const { rect } = useFrameRect(ref)
  const shot = useStore((s) => s.activeCamera === 'shot')
  const ratio = useStore((s) => s.scene.canvasRatio)
  const sketch = useStore((s) => s.sketch)
  const view = useStore((s) => s.sketchView)
  const image = useStore((s) => (s.sketch.hash ? s.sketchImages[s.sketch.hash] : undefined))

  let underlay = null
  if (image && sketch.size && view.visible) {
    const a = sketch.alignment
    const box = imageFrameSize(image.width / image.height, ratio)
    const w = box.w * rect.height
    const h = box.h * rect.height
    const cx = rect.width / 2 + a.x * rect.height
    const cy = rect.height / 2 - a.y * rect.height
    underlay = (
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
          opacity: view.opacity,
          transformOrigin: '0 0',
          // Rotation is counter-clockwise in frame space (y up); CSS rotates clockwise.
          transform: `translate(${cx}px, ${cy}px) rotate(${-a.rotation}rad) scale(${a.scale}) translate(${-w / 2}px, ${-h / 2}px)`,
          userSelect: 'none',
        }}
      />
    )
  }

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
