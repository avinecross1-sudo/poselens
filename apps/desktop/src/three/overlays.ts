// Viewport-only overlays: head-unit ruler and gaze line. Never part of exported PNGs
// (Viewport passes `group` and the gaze object to the export's hide list).
import * as THREE from 'three'
import type { Measurements } from '../lib/measure'
import type { Rig } from './bodyRig'

const RULER_COLOR = 0x34d399
const GUIDE_COLOR = 0x34d399
const GUIDE_OPACITY = 0.22
const GAZE_COLOR = 0xf472b6
/** Ruler stands this far outside the shoulder line, on the character's right. */
const RULER_GAP_M = 0.3
const TICK_HALF_WIDTH_M = 0.05
/** Faint guides across the figure at each head unit extend this far past the shoulders. */
const GUIDE_OVERHANG_M = 0.12
/** Label sprite height in meters; width follows the text. */
const LABEL_HEIGHT_M = 0.05
const LABEL_FONT_PX = 48
const LABEL_PAD_PX = 10
/** Gaze arrow length and the dashed sight line beyond it, meters. */
const GAZE_ARROW_M = 0.45
const GAZE_LINE_M = 4
const GAZE_DASH_M = 0.08
/** Eye level sits this fraction of the head radius above the head centre, and the eyes this far forward. */
const EYE_HEIGHT_FRAC = 0.1
const EYE_FORWARD_FRAC = 0.95

function labelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.font = `600 ${LABEL_FONT_PX}px system-ui, sans-serif`
  const w = Math.ceil(ctx.measureText(text).width) + LABEL_PAD_PX * 2
  canvas.width = w
  canvas.height = LABEL_FONT_PX + LABEL_PAD_PX * 2
  ctx.font = `600 ${LABEL_FONT_PX}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, LABEL_PAD_PX, canvas.height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sprite.scale.set((LABEL_HEIGHT_M * canvas.width) / canvas.height, LABEL_HEIGHT_M, 1)
  sprite.renderOrder = 20
  return sprite
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
      o.geometry.dispose()
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m instanceof THREE.SpriteMaterial) m.map?.dispose()
        m.dispose()
      }
    }
  })
}

export interface Overlays {
  /** Head-unit ruler; positioned at the root's floor point and yaw each frame. */
  headUnits: THREE.Group
  /** Gaze arrow + sight line; parented to the head node. */
  gaze: THREE.Group
  /** Rebuilds the ruler for new body measurements. */
  setMeasurements: (m: Measurements) => void
  /** Moves the gaze origin to the eyes for the current head size. */
  setHead: (rig: Rig) => void
  /** Keeps the ruler next to the figure: root position on the floor, root yaw only. */
  follow: (rootPosition: THREE.Vector3, rootYaw: number) => void
  dispose: () => void
}

export function createOverlays(headNode: THREE.Object3D): Overlays {
  const headUnits = new THREE.Group()
  headUnits.name = 'head-units'
  const content = new THREE.Group()
  headUnits.add(content)

  const gaze = new THREE.Group()
  gaze.name = 'gaze'
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), GAZE_ARROW_M, GAZE_COLOR, 0.08, 0.04)
  arrow.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined
    if (m) m.depthTest = false
    o.renderOrder = 20
  })
  const sight = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, GAZE_ARROW_M), new THREE.Vector3(0, 0, GAZE_LINE_M)]),
    new THREE.LineDashedMaterial({ color: GAZE_COLOR, dashSize: GAZE_DASH_M, gapSize: GAZE_DASH_M, transparent: true, opacity: 0.8 }),
  )
  sight.computeLineDistances()
  gaze.add(arrow, sight)
  headNode.add(gaze)

  return {
    headUnits,
    gaze,

    setMeasurements(m) {
      disposeTree(content)
      content.clear()
      const x = -(m.shoulderWidth / 2 + RULER_GAP_M)
      const pts: THREE.Vector3[] = [new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, m.height, 0)]
      const guides: THREE.Vector3[] = []
      const guideHalf = m.shoulderWidth / 2 + GUIDE_OVERHANG_M
      m.ticks.forEach((y, i) => {
        pts.push(new THREE.Vector3(x - TICK_HALF_WIDTH_M, y, 0), new THREE.Vector3(x + TICK_HALF_WIDTH_M, y, 0))
        guides.push(new THREE.Vector3(-guideHalf, y, 0), new THREE.Vector3(guideHalf, y, 0))
        if (i > 0) {
          // Number each head unit at its midpoint, counting down from the crown.
          const label = labelSprite(String(i), '#6ee7b7')
          label.position.set(x - TICK_HALF_WIDTH_M - LABEL_HEIGHT_M, y + m.headUnit / 2, 0)
          content.add(label)
        }
      })
      content.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: RULER_COLOR, depthTest: false, transparent: true }),
        ),
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(guides),
          new THREE.LineBasicMaterial({ color: GUIDE_COLOR, transparent: true, opacity: GUIDE_OPACITY, depthWrite: false }),
        ),
      )
      const total = labelSprite(`${m.heads.toFixed(1)} heads · ${m.height.toFixed(2)} m`, '#a7f3d0')
      total.position.set(x, m.height + LABEL_HEIGHT_M * 1.2, 0)
      content.add(total)
      content.traverse((o) => (o.renderOrder = Math.max(o.renderOrder, 15)))
    },

    setHead(rig) {
      const head = rig.head.segment
      if (head.shape !== 'sphere') return
      gaze.position.set(0, head.center[1] + head.radius * EYE_HEIGHT_FRAC, head.radius * EYE_FORWARD_FRAC)
    },

    follow(rootPosition, rootYaw) {
      headUnits.position.set(rootPosition.x, 0, rootPosition.z)
      headUnits.rotation.set(0, rootYaw, 0)
    },

    dispose() {
      disposeTree(content)
      headNode.remove(gaze)
      disposeTree(gaze)
    },
  }
}
