// Offscreen transparent render through the SHOT camera. Helpers and gizmo are hidden for the shot.
import * as THREE from 'three'
import { applyShotCamera, createShotCamera } from '../three/cameraRig'
import type { CameraState } from '../types/scene'

export interface RenderPngInput {
  scene: THREE.Scene
  camera: CameraState
  widthPx: number
  heightPx: number
  /** Objects to hide during the render (helpers, gizmo). */
  hide: THREE.Object3D[]
}

export async function renderTransparentPng(input: RenderPngInput): Promise<Uint8Array> {
  const { scene, widthPx, heightPx } = input
  // A dedicated renderer keeps the on-screen viewport untouched and outputs sRGB like the screen does.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(widthPx, heightPx, false)
    renderer.setClearColor(0x000000, 0)

    const cam = createShotCamera()
    applyShotCamera(cam, input.camera, widthPx / heightPx)

    const wasVisible = input.hide.map((o) => o.visible)
    const background = scene.background
    input.hide.forEach((o) => (o.visible = false))
    scene.background = null
    try {
      renderer.render(scene, cam)
    } finally {
      input.hide.forEach((o, i) => (o.visible = wasVisible[i] ?? true))
      scene.background = background
    }

    const blob = await new Promise<Blob>((resolve, reject) =>
      renderer.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
    )
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
