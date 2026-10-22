// Shot-camera projection in frame space, matching cameraRig.applyShotCamera (lookAt with up, then roll
// about the view axis). Pure Three.js math, no scene graph, so it runs under vitest.
//
// Frame space (lib/sketchSpace.ts): origin = frame centre, +y up, unit = frame height. The camera looks
// down its local -Z; the frame point (x, y) is the camera-local ray (x, y, -f) with f = focal / sensor.
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { CameraState, Vec2 } from '../types/scene'

export interface CameraModel {
  position: Vector3
  /** Camera-to-world rotation. */
  rotation: Quaternion
  /** Focal length in frame heights. */
  f: number
}

export interface Ray {
  origin: Vector3
  /** Unit length. */
  dir: Vector3
}

export function cameraModel(c: CameraState): CameraModel {
  const position = new Vector3(...c.position)
  const m = new Matrix4().lookAt(position, new Vector3(...c.target), new Vector3(...c.up))
  const rotation = new Quaternion().setFromRotationMatrix(m).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), c.roll))
  return { position, rotation, f: c.focal / c.sensorHeight }
}

/** Unit view direction of the camera (world). */
export const viewDir = (cam: CameraModel): Vector3 => new Vector3(0, 0, -1).applyQuaternion(cam.rotation)

export function rayThrough(cam: CameraModel, p: Vec2): Ray {
  const dir = new Vector3(p[0], p[1], -cam.f).applyQuaternion(cam.rotation).normalize()
  return { origin: cam.position.clone(), dir }
}

/** Distance along the view axis (m); <= 0 means behind the camera. */
export const viewDepth = (cam: CameraModel, p: Vector3): number => p.clone().sub(cam.position).dot(viewDir(cam))

/** Frame point of a world point, or null when it is behind the camera. */
export function project(cam: CameraModel, p: Vector3): Vec2 | null {
  const local = p.clone().sub(cam.position).applyQuaternion(cam.rotation.clone().invert())
  if (local.z >= 0) return null
  return [(cam.f * local.x) / -local.z, (cam.f * local.y) / -local.z]
}

export const pointOnRay = (r: Ray, t: number): Vector3 => r.origin.clone().addScaledVector(r.dir, t)

/** Shortest distance (m) from a point to a ray's line. */
export function distanceToRay(r: Ray, p: Vector3): number {
  const t = p.clone().sub(r.origin).dot(r.dir)
  return pointOnRay(r, t).distanceTo(p)
}

/** Point on the ray at a given view depth (m). */
export function pointAtDepth(cam: CameraModel, r: Ray, depth: number): Vector3 {
  return pointOnRay(r, depth / r.dir.dot(viewDir(cam)))
}

/** Ray parameter where it meets the horizontal plane y = h, or null when it never does (in front). */
export function rayPlaneY(r: Ray, h: number): number | null {
  if (Math.abs(r.dir.y) < 1e-9) return null
  const t = (h - r.origin.y) / r.dir.y
  return t > 0 ? t : null
}
