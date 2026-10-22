// Shared layout of the shot frame inside the viewport. Used by the 3D canvas and the sketch layers.

/** Gap (CSS px) kept around the shot frame so its edge is visible against the letterbox. */
export const SHOT_FRAME_MARGIN_PX = 24

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Largest rect of `ratio` (w/h) centred inside w x h, minus margin. */
export function fitRect(w: number, h: number, ratio: number, margin: number): Rect {
  const aw = Math.max(1, w - margin * 2)
  const ah = Math.max(1, h - margin * 2)
  const width = aw / ah > ratio ? ah * ratio : aw
  const height = width / ratio
  return { left: (w - width) / 2, top: (h - height) / 2, width, height }
}
