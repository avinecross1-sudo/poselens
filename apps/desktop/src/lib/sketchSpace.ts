// Coordinate spaces for the sketch underlay and perspective cues. Pure functions.
//
//  image space  u,v in 0..1 across the sketch, origin top-left, v down. Cues are stored here.
//  frame space  origin at the shot frame centre, +x right, +y UP, unit = frame HEIGHT.
//               The frame is canvasRatio (w/h) wide, so it spans x in +-ratio/2 and y in +-0.5.
//  pixel space  CSS px inside the viewport host.
//
// The sketch is fitted ("contain") into the frame, then the user's alignment is applied:
// scale, rotate about the sketch centre (counter-clockwise positive, y up), translate in frame units.
import type { Vec2 } from '../types/scene'
import type { Rect } from './frameLayout'

export interface SketchAlignment {
  x: number
  y: number
  scale: number
  rotation: number
}

export const IDENTITY_ALIGNMENT: SketchAlignment = { x: 0, y: 0, scale: 1, rotation: 0 }

/** Scale bounds, so a slider or typed value can never collapse the sketch. */
export const MIN_SKETCH_SCALE = 0.05
export const MAX_SKETCH_SCALE = 8

/** Size (frame-height units) of the sketch at scale 1: fitted inside the frame. */
export function imageFrameSize(imageAspect: number, frameAspect: number): { w: number; h: number } {
  return imageAspect >= frameAspect ? { w: frameAspect, h: frameAspect / imageAspect } : { w: imageAspect, h: 1 }
}

export function imageToFrame(p: Vec2, a: SketchAlignment, imageAspect: number, frameAspect: number): Vec2 {
  const size = imageFrameSize(imageAspect, frameAspect)
  const lx = (p[0] - 0.5) * size.w * a.scale
  const ly = (0.5 - p[1]) * size.h * a.scale
  const c = Math.cos(a.rotation)
  const s = Math.sin(a.rotation)
  return [a.x + lx * c - ly * s, a.y + lx * s + ly * c]
}

export function frameToImage(p: Vec2, a: SketchAlignment, imageAspect: number, frameAspect: number): Vec2 {
  const size = imageFrameSize(imageAspect, frameAspect)
  const dx = p[0] - a.x
  const dy = p[1] - a.y
  const c = Math.cos(a.rotation)
  const s = Math.sin(a.rotation)
  const lx = dx * c + dy * s
  const ly = -dx * s + dy * c
  return [lx / (size.w * a.scale) + 0.5, 0.5 - ly / (size.h * a.scale)]
}

export function frameToPx(p: Vec2, r: Rect): Vec2 {
  return [r.left + r.width / 2 + p[0] * r.height, r.top + r.height / 2 - p[1] * r.height]
}

export function pxToFrame(p: Vec2, r: Rect): Vec2 {
  return [(p[0] - r.left - r.width / 2) / r.height, (r.top + r.height / 2 - p[1]) / r.height]
}
