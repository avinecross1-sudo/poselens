// Readability looks: materials that replace the figure's own while it is drawn (scene.overrideMaterial),
// and the layered render that applies them to the figure only. Used by the viewport and by PNG export.
import * as THREE from 'three'
import type { ViewLook } from '../state/types'

const SILHOUETTE_COLOR = 0x18181b
/** Three-value study: shadow, half-tone and light, as display grey levels 0..1. */
const VALUE_TONES = [0.27, 0.59, 0.91] as const
/** Facing (dot of normal and light) above which a surface is in the light, and below which it is in shadow. */
const VALUE_LIGHT_FROM = 0.45
const VALUE_SHADOW_BELOW = -0.1
/** The values look lights from the key light's side: up, right and toward the default camera. */
export const VALUE_LIGHT_DIR: readonly [number, number, number] = [3, 5, 4]
/** Depth shading: nearest parts light and warm, farthest dark and cool. */
const DEPTH_NEAR_COLOR = 0xf5e6c8
const DEPTH_FAR_COLOR = 0x27344a
/** How much the surface's facing (view-space normal z) darkens the depth colour at grazing angles. */
const DEPTH_FACING_SHADE = 0.3
/** Occlusion hint: hidden parts drawn through the figure in this colour. */
const OCCLUSION_COLOR = 0x22d3ee
const OCCLUSION_OPACITY = 0.35
/**
 * A surface counts as hidden only this far (m) behind the visible one. The mannequin's own overlaps (joint spheres
 * inside limbs, capsule ends inside the torso, the neck under the chest) sit within a few cm and are not hints.
 */
export const OCCLUSION_MIN_GAP_M = 0.08
/** Depth range padding around the figure's joints (m), so hands and the head's far side stay inside it. */
export const DEPTH_RANGE_PAD_M = 0.15

export interface Looks {
  /** null for 'normal' (the figure's own materials). */
  material: (look: ViewLook | 'shaded') => THREE.Material | null
  /** Draws the parts of the figure hidden behind other parts. Call with only the figure visible. */
  drawOcclusion: OcclusionPass
  /** View-space distances (m) the depth look maps from light to dark. */
  setDepthRange: (near: number, far: number) => void
  dispose: () => void
}

const DEPTH_VERT = /* glsl */ `
varying float vDepth;
varying vec3 vNormal;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`

const DEPTH_FRAG = /* glsl */ `
uniform float uNear;
uniform float uFar;
uniform vec3 uNearColor;
uniform vec3 uFarColor;
uniform float uFacingShade;
varying float vDepth;
varying vec3 vNormal;
void main() {
  float t = clamp((vDepth - uNear) / max(uFar - uNear, 1e-4), 0.0, 1.0);
  float facing = abs(normalize(vNormal).z);
  vec3 c = mix(uNearColor, uFarColor, t) * (1.0 - uFacingShade + uFacingShade * facing);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

export type OcclusionPass = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera) => void

const OCCLUSION_VERT = /* glsl */ `
varying float vViewZ;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = mv.z;
  gl_Position = projectionMatrix * mv;
}`

const OCCLUSION_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uNear;
uniform float uFar;
uniform float uMinGap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vViewZ;
void main() {
  float d = texture2D(tDepth, gl_FragCoord.xy / uResolution).x;
  if (d >= 1.0) discard;
  float front = -perspectiveDepthToViewZ(d, uNear, uFar);
  if (-vViewZ < front + uMinGap) discard;
  gl_FragColor = vec4(uColor, uOpacity);
}`

const VALUES_VERT = /* glsl */ `
varying vec3 vWorldNormal;
void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const VALUES_FRAG = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uTones;
uniform float uLightFrom;
uniform float uShadowBelow;
varying vec3 vWorldNormal;
void main() {
  float t = dot(normalize(vWorldNormal), uLightDir);
  float v = t > uLightFrom ? uTones.z : (t > uShadowBelow ? uTones.y : uTones.x);
  // Tones are display values: written as they are, without the linear-to-sRGB step.
  gl_FragColor = vec4(vec3(v), 1.0);
}`

export function createLooks(): Looks {
  const silhouette = new THREE.MeshBasicMaterial({ color: SILHOUETTE_COLOR })
  // Hard three-step shading from one light direction; ambient light would blur the steps, so lights are ignored.
  const values = new THREE.ShaderMaterial({
    vertexShader: VALUES_VERT,
    fragmentShader: VALUES_FRAG,
    uniforms: {
      uLightDir: { value: new THREE.Vector3(...VALUE_LIGHT_DIR).normalize() },
      uTones: { value: new THREE.Vector3(...VALUE_TONES) },
      uLightFrom: { value: VALUE_LIGHT_FROM },
      uShadowBelow: { value: VALUE_SHADOW_BELOW },
    },
  })
  const depth = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERT,
    fragmentShader: DEPTH_FRAG,
    uniforms: {
      uNear: { value: 1 },
      uFar: { value: 5 },
      uNearColor: { value: new THREE.Color(DEPTH_NEAR_COLOR) },
      uFarColor: { value: new THREE.Color(DEPTH_FAR_COLOR) },
      uFacingShade: { value: DEPTH_FACING_SHADE },
    },
  })
  // Occlusion: the figure's front depth goes into a depth texture, then every figure surface farther than it by more
  // than the gap is drawn.
  const depthTarget = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) })
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false })
  const occlusionUniforms = {
    tDepth: { value: depthTarget.depthTexture },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.05 },
    uFar: { value: 1000 },
    uMinGap: { value: OCCLUSION_MIN_GAP_M },
    uColor: { value: new THREE.Color(OCCLUSION_COLOR) },
    uOpacity: { value: OCCLUSION_OPACITY },
  }
  const occlusion = new THREE.ShaderMaterial({
    vertexShader: OCCLUSION_VERT,
    fragmentShader: OCCLUSION_FRAG,
    uniforms: occlusionUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const size = new THREE.Vector2()
  const drawOcclusion: OcclusionPass = (renderer, scene, cam) => {
    renderer.getDrawingBufferSize(size)
    if (depthTarget.width !== size.x || depthTarget.height !== size.y) depthTarget.setSize(size.x, size.y)
    const prevTarget = renderer.getRenderTarget()
    const prevOverride = scene.overrideMaterial
    const autoClear = renderer.autoClear
    try {
      renderer.setRenderTarget(depthTarget)
      renderer.autoClear = true
      scene.overrideMaterial = depthOnly
      renderer.render(scene, cam)
      renderer.setRenderTarget(prevTarget)
      renderer.autoClear = false
      occlusionUniforms.uResolution.value.copy(size)
      occlusionUniforms.uNear.value = cam.near
      occlusionUniforms.uFar.value = cam.far
      scene.overrideMaterial = occlusion
      renderer.render(scene, cam)
    } finally {
      renderer.setRenderTarget(prevTarget)
      scene.overrideMaterial = prevOverride
      renderer.autoClear = autoClear
    }
  }

  return {
    material: (look) => {
      switch (look) {
        case 'normal':
          return null
        case 'silhouette':
          return silhouette
        case 'values':
        case 'shaded':
          return values
        case 'depth':
          return depth
      }
    },
    drawOcclusion,
    setDepthRange(near, far) {
      const u = depth.uniforms
      if (u['uNear'] && u['uFar']) {
        u['uNear'].value = near
        u['uFar'].value = far
      }
    },
    dispose() {
      silhouette.dispose()
      values.dispose()
      depth.dispose()
      occlusion.dispose()
      depthOnly.dispose()
      depthTarget.depthTexture?.dispose()
      depthTarget.dispose()
    },
  }
}

/** View-space depth range of some world points (m), padded; for the depth look. */
export function depthRange(cam: THREE.Camera, points: readonly THREE.Vector3[], pad = DEPTH_RANGE_PAD_M): [number, number] {
  let near = Infinity
  let far = -Infinity
  const v = new THREE.Vector3()
  for (const p of points) {
    const d = -v.copy(p).applyMatrix4(cam.matrixWorldInverse).z
    near = Math.min(near, d)
    far = Math.max(far, d)
  }
  if (!Number.isFinite(near)) return [1, 5]
  return [Math.max(0, near - pad), far + pad]
}

export interface CompositeParts {
  scene: THREE.Scene
  /** The figure group: drawn with the look material. */
  figure: THREE.Object3D
  /** Drawn last, untouched by the look (gizmos, handles, guides). */
  overlays: readonly THREE.Object3D[]
}

/**
 * Background (everything but the overlays, figure included so it still casts its shadow), then the figure alone
 * with the look over a cleared depth buffer, then the occlusion hint (figure only), then the overlays. With no look and no hint
 * this is a plain render.
 */
export function renderComposite(
  renderer: THREE.WebGLRenderer,
  cam: THREE.PerspectiveCamera,
  parts: CompositeParts,
  opts: { look: THREE.Material | null; occlusion: OcclusionPass | null },
): void {
  const { scene, figure, overlays } = parts
  if (!opts.look && !opts.occlusion) {
    renderer.render(scene, cam)
    return
  }
  const children = [...scene.children]
  const saved = children.map((o) => o.visible)
  const show = (keep: (o: THREE.Object3D) => boolean): void =>
    children.forEach((o, i) => (o.visible = Boolean(saved[i]) && (o instanceof THREE.Light || keep(o))))
  const autoClear = renderer.autoClear
  const override = scene.overrideMaterial
  try {
    show((o) => !overlays.includes(o))
    renderer.autoClear = true
    renderer.render(scene, cam)
    renderer.autoClear = false
    show((o) => o === figure)
    if (opts.look) {
      renderer.clearDepth()
      scene.overrideMaterial = opts.look
      renderer.render(scene, cam)
    }
    if (opts.occlusion) opts.occlusion(renderer, scene, cam)
    scene.overrideMaterial = null
    show((o) => overlays.includes(o))
    renderer.render(scene, cam)
  } finally {
    children.forEach((o, i) => (o.visible = Boolean(saved[i])))
    scene.overrideMaterial = override
    renderer.autoClear = autoClear
  }
}
