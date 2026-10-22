import type { Vec3 } from '../types/scene'
import { clamp, degToRad } from './units'

/**
 * Shot camera controls are derived views over the stored position + target.
 *  - height        = position.y
 *  - targetHeight  = target.y
 *  - yaw           = horizontal angle of the camera around the target, 0 = camera on +Z looking at -Z
 *  - pitch         = vertical look angle, negative = looking down
 *  - distance      = horizontal distance from camera to target
 * Height, target height and pitch are coupled: changing one updates the others' display.
 * Pivot (target x/z) never moves in Phase 1; only its height does.
 */
export interface CameraControls {
  height: number
  targetHeight: number
  yaw: number
  pitch: number
  distance: number
}

/** Pitch stops short of straight up/down so lookAt never degenerates with up = +Y. */
export const MAX_PITCH_RAD = degToRad(85)
/** Smallest horizontal camera-to-target distance (m); avoids a degenerate yaw. */
export const MIN_DISTANCE_M = 0.05

export function controlsFromCamera(position: Vec3, target: Vec3): CameraControls {
  const dx = position[0] - target[0]
  const dz = position[2] - target[2]
  const distance = Math.hypot(dx, dz)
  return {
    height: position[1],
    targetHeight: target[1],
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(target[1] - position[1], distance),
    distance,
  }
}

/** Rebuilds position + target from controls. Pitch wins over targetHeight if they disagree. */
export function cameraFromControls(c: CameraControls, pivot: Vec3): { position: Vec3; target: Vec3 } {
  const distance = Math.max(c.distance, MIN_DISTANCE_M)
  const pitch = clamp(c.pitch, -MAX_PITCH_RAD, MAX_PITCH_RAD)
  const target: Vec3 = [pivot[0], c.height + Math.tan(pitch) * distance, pivot[2]]
  const position: Vec3 = [pivot[0] + Math.sin(c.yaw) * distance, c.height, pivot[2] + Math.cos(c.yaw) * distance]
  return { position, target }
}

export function setHeight(position: Vec3, target: Vec3, height: number): { position: Vec3; target: Vec3 } {
  return { position: [position[0], height, position[2]], target: [...target] }
}

export function setTargetHeight(position: Vec3, target: Vec3, targetHeight: number): { position: Vec3; target: Vec3 } {
  return { position: [...position], target: [target[0], targetHeight, target[2]] }
}

/** Orbits the camera around the target at the same horizontal distance and height. */
export function setYaw(position: Vec3, target: Vec3, yaw: number): { position: Vec3; target: Vec3 } {
  const c = controlsFromCamera(position, target)
  return cameraFromControls({ ...c, yaw }, target)
}

/** Tilts the camera in place: position fixed, target height moves. */
export function setPitch(position: Vec3, target: Vec3, pitch: number): { position: Vec3; target: Vec3 } {
  const c = controlsFromCamera(position, target)
  return cameraFromControls({ ...c, pitch }, target)
}

/** Dollies the camera toward/away from the target, keeping camera height and target height. */
export function setDistance(position: Vec3, target: Vec3, distance: number): { position: Vec3; target: Vec3 } {
  const c = controlsFromCamera(position, target)
  const d = Math.max(distance, MIN_DISTANCE_M)
  const pitch = Math.atan2(c.targetHeight - c.height, d)
  return cameraFromControls({ ...c, distance: d, pitch }, target)
}
