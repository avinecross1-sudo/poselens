// Two cameras, never merged (CLAUDE.md): EDITOR (OrbitControls, not saved) and SHOT (state-driven only).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { focalToVerticalFov, radToDeg } from '../lib/units'
import type { CameraState } from '../types/scene'

/** Clip planes (m). Far must exceed helpers.HORIZON_RADIUS_M so the horizon ring is drawn. */
export const CAMERA_NEAR_M = 0.05
export const CAMERA_FAR_M = 1000

const EDITOR_START_POSITION = new THREE.Vector3(3.2, 2.2, 5.2)
const EDITOR_START_TARGET = new THREE.Vector3(0, 0.9, 0)
const EDITOR_FOV_DEG = 45

export function createEditorCamera(domElement: HTMLElement): { camera: THREE.PerspectiveCamera; controls: OrbitControls } {
  const camera = new THREE.PerspectiveCamera(EDITOR_FOV_DEG, 1, CAMERA_NEAR_M, CAMERA_FAR_M)
  camera.position.copy(EDITOR_START_POSITION)
  const controls = new OrbitControls(camera, domElement)
  controls.target.copy(EDITOR_START_TARGET)
  controls.enableDamping = true
  controls.update()
  return { camera, controls }
}

export function createShotCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(EDITOR_FOV_DEG, 1, CAMERA_NEAR_M, CAMERA_FAR_M)
}

/** Writes camera state into a Three camera. Roll turns the camera about its own view axis. */
export function applyShotCamera(cam: THREE.PerspectiveCamera, state: CameraState, aspect: number): void {
  cam.fov = radToDeg(focalToVerticalFov(state.focal, state.sensorHeight))
  cam.aspect = aspect
  cam.position.set(...state.position)
  cam.up.set(...state.up)
  cam.lookAt(new THREE.Vector3(...state.target))
  cam.rotateZ(state.roll)
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()
}
