// Offscreen transparent render through the SHOT camera for PNG export and shot thumbnails. Viewport-only objects
// are hidden; the export preset picks the figure's look; grid and ground shadow follow the export settings.
import * as THREE from 'three'
import { applyShotCamera, createShotCamera } from '../three/cameraRig'
import type { Helpers } from '../three/helpers'
import { renderComposite, type Looks } from '../three/looks'
import type { CameraState, ExportOptions, ExportPreset } from '../types/scene'
import { exportFrame, type NdcBox } from './framing'
import { flipRows, lineart } from './lineart'

export interface ExportScene {
  scene: THREE.Scene
  /** The figure group (mannequin, with the anatomy forms inside it). */
  figure: THREE.Object3D
  /** Always hidden in exports: gizmo, frustum, overlays, handles, ghost, balance. */
  hide: THREE.Object3D[]
  helpers: Helpers
  shadowCatcher: THREE.Object3D
  keyLight: THREE.DirectionalLight
  looks: Looks
}

export interface ExportRequest {
  camera: CameraState
  /** Shot frame aspect (scene.canvasRatio). */
  aspect: number
  preset: ExportPreset
  options: ExportOptions
}

export interface RenderedPng {
  png: Uint8Array
  widthPx: number
  heightPx: number
}

/** Lineart depth is packed into 16 bits over the figure's depth range plus this padding (m). */
const LINEART_DEPTH_PAD_M = 0.5

const NORMAL_VERT = /* glsl */ `
varying vec3 vNormal;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`
const NORMAL_FRAG = /* glsl */ `
varying vec3 vNormal;
void main() { gl_FragColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); }`
const DEPTH_FRAG = /* glsl */ `
uniform float uNear;
uniform float uFar;
varying float vDepth;
void main() {
  float v = floor(clamp((vDepth - uNear) / (uFar - uNear), 0.0, 1.0) * 65535.0 + 0.5);
  float hi = floor(v / 256.0);
  gl_FragColor = vec4(hi / 255.0, (v - hi * 256.0) / 255.0, 0.0, 1.0);
}`

/** NDC bounds of the visible figure meshes through `cam` (null when nothing is in front of the camera). */
export function figureNdcBox(figure: THREE.Object3D, cam: THREE.Camera): NdcBox | null {
  figure.updateWorldMatrix(true, true)
  const box: NdcBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const v = new THREE.Vector3()
  const view = new THREE.Vector3()
  figure.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const pos = o.geometry.getAttribute('position')
    if (!pos) return
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      if (view.copy(v).applyMatrix4(cam.matrixWorldInverse).z >= 0) continue
      v.project(cam)
      box.minX = Math.min(box.minX, v.x)
      box.maxX = Math.max(box.maxX, v.x)
      box.minY = Math.min(box.minY, v.y)
      box.maxY = Math.max(box.maxY, v.y)
    }
  })
  return Number.isFinite(box.minX) ? box : null
}

/** Figure meshes still cast shadows but draw nothing (lineart draws its own lines over the background). */
function withGhostFigure<T>(figure: THREE.Object3D, fn: () => T): T {
  const mats = new Map<THREE.Material, [boolean, boolean]>()
  figure.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!mats.has(m)) mats.set(m, [m.colorWrite, m.depthWrite])
  })
  mats.forEach((_, m) => {
    m.colorWrite = false
    m.depthWrite = false
  })
  try {
    return fn()
  } finally {
    mats.forEach(([c, d], m) => {
      m.colorWrite = c
      m.depthWrite = d
    })
  }
}

function readFigure(renderer: THREE.WebGLRenderer, es: ExportScene, cam: THREE.Camera, mat: THREE.Material, w: number, h: number): Uint8Array {
  const rt = new THREE.WebGLRenderTarget(w, h)
  const buf = new Uint8Array(w * h * 4)
  const children = [...es.scene.children]
  const saved = children.map((o) => o.visible)
  try {
    children.forEach((o) => (o.visible = o === es.figure && o.visible))
    es.scene.overrideMaterial = mat
    renderer.setRenderTarget(rt)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(es.scene, cam)
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf)
  } finally {
    es.scene.overrideMaterial = null
    renderer.setRenderTarget(null)
    children.forEach((o, i) => (o.visible = Boolean(saved[i])))
    rt.dispose()
  }
  flipRows(buf, w, h)
  return buf
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

export async function renderExportPng(es: ExportScene, req: ExportRequest): Promise<RenderedPng> {
  const { scene, helpers } = es
  const probe = createShotCamera()
  applyShotCamera(probe, req.camera, req.aspect)
  const frame = exportFrame(req.options, req.aspect, req.options.framing === 'bounds' ? figureNdcBox(es.figure, probe) : null)
  const { widthPx: w, heightPx: h } = frame

  // A dedicated renderer keeps the on-screen viewport untouched and outputs sRGB like the screen does.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const cam = createShotCamera()
  applyShotCamera(cam, req.camera, frame.aspect)
  if (frame.crop) {
    cam.setViewOffset(frame.crop.fullW, frame.crop.fullH, frame.crop.x, frame.crop.y, frame.crop.w, frame.crop.h)
    cam.updateProjectionMatrix()
  }

  const toggled: [THREE.Object3D, boolean][] = [
    ...es.hide.map((o): [THREE.Object3D, boolean] => [o, o.visible]),
    [helpers.group, helpers.group.visible],
    [helpers.ground, helpers.ground.visible],
    [helpers.grid, helpers.grid.visible],
    [helpers.horizon, helpers.horizon.visible],
    [es.shadowCatcher, es.shadowCatcher.visible],
  ]
  const castShadow = es.keyLight.castShadow
  const background = scene.background
  try {
    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    renderer.setClearColor(0x000000, 0)
    es.hide.forEach((o) => (o.visible = false))
    helpers.group.visible = req.options.grid
    helpers.ground.visible = false
    helpers.horizon.visible = false
    helpers.grid.visible = req.options.grid
    es.shadowCatcher.visible = req.options.shadow
    es.keyLight.castShadow = req.options.shadow
    scene.background = null

    if (req.preset === 'lineart') {
      const pts: THREE.Vector3[] = []
      es.figure.traverseVisible((o) => pts.push(o.getWorldPosition(new THREE.Vector3())))
      const view = pts.map((p) => -p.applyMatrix4(cam.matrixWorldInverse).z)
      const near = Math.max(0, Math.min(...view) - LINEART_DEPTH_PAD_M)
      const far = Math.max(...view) + LINEART_DEPTH_PAD_M
      const normalMat = new THREE.ShaderMaterial({ vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG })
      const depthMat = new THREE.ShaderMaterial({
        vertexShader: NORMAL_VERT,
        fragmentShader: DEPTH_FRAG,
        uniforms: { uNear: { value: near }, uFar: { value: far } },
      })
      try {
        const normals = readFigure(renderer, es, cam, normalMat, w, h)
        const depth = readFigure(renderer, es, cam, depthMat, w, h)
        // Background (grid, shadow) with the figure still casting but not drawn, then the lines over it.
        withGhostFigure(es.figure, () => renderer.render(scene, cam))
        const out = document.createElement('canvas')
        out.width = w
        out.height = h
        const ctx = out.getContext('2d')
        if (!ctx) throw new Error('2D canvas unavailable')
        ctx.drawImage(renderer.domElement, 0, 0)
        const lines = document.createElement('canvas')
        lines.width = w
        lines.height = h
        const lctx = lines.getContext('2d')
        if (!lctx) throw new Error('2D canvas unavailable')
        lctx.putImageData(new ImageData(lineart({ w, h, normals, depth, near, far }), w, h), 0, 0)
        ctx.drawImage(lines, 0, 0)
        return { png: await canvasToPng(out), widthPx: w, heightPx: h }
      } finally {
        normalMat.dispose()
        depthMat.dispose()
      }
    }

    const look = req.preset === 'clean' ? null : es.looks.material(req.preset)
    renderComposite(renderer, cam, { scene, figure: es.figure, overlays: [] }, { look, occlusion: null })
    return { png: await canvasToPng(renderer.domElement), widthPx: w, heightPx: h }
  } finally {
    toggled.forEach(([o, v]) => (o.visible = v))
    es.keyLight.castShadow = castShadow
    scene.background = background
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
