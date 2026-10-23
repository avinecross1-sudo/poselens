// Export framing. viewport = the full shot frame; bounds = the shot frame cropped to the figure plus a margin
// (same pixel density); fixed = a set canvas the shot camera renders into at its own vertical field of view.
import type { ExportOptions } from '../types/scene'
import { exportHeightPx } from './metadata'

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/** Figure bounds in normalized device coordinates (x right, y up, -1..1). */
export interface NdcBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface ExportFrame {
  /** Output PNG size. */
  widthPx: number
  heightPx: number
  /** Aspect the shot camera renders with. */
  aspect: number
  /** Sub-rectangle of the full frame to render (camera view offset), or null for the whole frame. */
  crop: (PixelRect & { fullW: number; fullH: number }) | null
}

/** Pixel rect (top-left origin) of an NDC box inside a full frame, grown by `margin` x its larger side, clamped. */
export function boundsCrop(box: NdcBox, fullW: number, fullH: number, margin: number): PixelRect | null {
  if (!(box.maxX > box.minX && box.maxY > box.minY)) return null
  const x0 = ((box.minX + 1) / 2) * fullW
  const x1 = ((box.maxX + 1) / 2) * fullW
  const y0 = ((1 - box.maxY) / 2) * fullH
  const y1 = ((1 - box.minY) / 2) * fullH
  const pad = Math.max(x1 - x0, y1 - y0) * margin
  const left = Math.max(0, Math.floor(x0 - pad))
  const top = Math.max(0, Math.floor(y0 - pad))
  const right = Math.min(fullW, Math.ceil(x1 + pad))
  const bottom = Math.min(fullH, Math.ceil(y1 + pad))
  if (right - left < 1 || bottom - top < 1) return null
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** `box` is needed for bounds framing; without it (figure off-frame) bounds falls back to the full frame. */
export function exportFrame(opts: ExportOptions, aspect: number, box: NdcBox | null): ExportFrame {
  if (opts.framing === 'fixed') {
    return { widthPx: opts.fixedWidthPx, heightPx: opts.fixedHeightPx, aspect: opts.fixedWidthPx / opts.fixedHeightPx, crop: null }
  }
  const fullW = opts.widthPx
  const fullH = exportHeightPx(fullW, aspect)
  const crop = opts.framing === 'bounds' && box ? boundsCrop(box, fullW, fullH, opts.boundsMargin) : null
  if (!crop) return { widthPx: fullW, heightPx: fullH, aspect, crop: null }
  return { widthPx: crop.w, heightPx: crop.h, aspect, crop: { ...crop, fullW, fullH } }
}
