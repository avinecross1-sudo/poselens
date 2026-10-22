// Wide-lens stretch (rectilinear projection). A round form at angle θ off the view axis images as an ellipse
// stretched radially by 1 / cos θ, so faces and limbs near the frame edge of a wide lens look pulled outward.

/** Focal lengths below this (mm, full-frame equivalent at 24 mm sensor height) count as wide. */
export const WIDE_LENS_MM = 24
/** Stretch levels the guide draws rings at. */
export const STRETCH_LEVELS = [1.1, 1.25, 1.5] as const

/** Radial stretch at a frame point `r` half-frame-heights from the centre. */
export function stretchAt(r: number, focalMm: number, sensorHeightMm: number): number {
  const tanTheta = (r * sensorHeightMm) / 2 / focalMm
  return Math.sqrt(1 + tanTheta * tanTheta)
}

/** Radius (in half-frame-heights) where the stretch reaches `level`. */
export function stretchRadius(level: number, focalMm: number, sensorHeightMm: number): number {
  const tanTheta = Math.sqrt(Math.max(0, level * level - 1))
  return (2 * focalMm * tanTheta) / sensorHeightMm
}

export interface LensGuide {
  wide: boolean
  /** Stretch in the frame corners. */
  cornerStretch: number
  /** Rings that fall inside the frame (radius in half-frame-heights). */
  rings: { level: number; radius: number }[]
}

/** aspect = frame width / height. */
export function lensGuide(focalMm: number, sensorHeightMm: number, aspect: number): LensGuide {
  const corner = Math.hypot(1, aspect)
  return {
    wide: focalMm < WIDE_LENS_MM,
    cornerStretch: stretchAt(corner, focalMm, sensorHeightMm),
    rings: STRETCH_LEVELS.map((level) => ({ level, radius: stretchRadius(level, focalMm, sensorHeightMm) })).filter((r) => r.radius < corner),
  }
}
