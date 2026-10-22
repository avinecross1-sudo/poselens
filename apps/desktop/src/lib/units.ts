export const RAD_PER_DEG = Math.PI / 180
export const DEG_PER_RAD = 180 / Math.PI

/** Full-frame vertical sensor height (CLAUDE.md). */
export const DEFAULT_SENSOR_HEIGHT_MM = 24
export const MIN_FOCAL_MM = 8
export const MAX_FOCAL_MM = 300

export const degToRad = (deg: number): number => deg * RAD_PER_DEG
export const radToDeg = (rad: number): number => rad * DEG_PER_RAD

/** Vertical field of view (radians) for a focal length and sensor height, both in mm. */
export function focalToVerticalFov(focalMm: number, sensorHeightMm: number): number {
  return 2 * Math.atan(sensorHeightMm / (2 * focalMm))
}

/** Inverse of focalToVerticalFov. */
export function verticalFovToFocal(fovRad: number, sensorHeightMm: number): number {
  return sensorHeightMm / (2 * Math.tan(fovRad / 2))
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
