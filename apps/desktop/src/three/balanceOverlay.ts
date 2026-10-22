// Balance overlay (balance-spec "UI"): CoM marker and plumb line, support polygon on the ground, contact dots,
// lean arrow and weight-shift line. Viewport-only; the Viewport passes `group` to the export's hide list.
import * as THREE from 'three'
import type { BalanceResult } from '../lib/balance'

const COM_RADIUS_M = 0.03
const CONTACT_RADIUS_M = 0.012
/** Ground items sit this far above y = 0 so they draw over the grid. */
const GROUND_LIFT_M = 0.003
const COLOR_OK = 0x22c55e
const COLOR_WARN = 0xef4444
const COLOR_NO_CONTACT = 0xf59e0b
const POLYGON_COLOR = 0x38bdf8
const POLYGON_OPACITY = 0.28
const CONTACT_COLOR = 0xe0f2fe
const LEAN_COLOR = 0xfacc15
const SHIFT_COLOR = 0xf472b6
/** Lean arrows shorter than this are not drawn (m). */
const MIN_ARROW_M = 0.01
const ARROW_HEAD_M = 0.04
const ARROW_HEAD_WIDTH_M = 0.025

export interface BalanceOverlay {
  group: THREE.Group
  update: (b: BalanceResult | null) => void
  dispose: () => void
}

const onTop = <T extends THREE.Material>(m: T): T => {
  m.depthTest = false
  m.transparent = true
  return m
}

export function createBalanceOverlay(): BalanceOverlay {
  const group = new THREE.Group()
  group.name = 'balance'
  group.renderOrder = 30

  const comMat = onTop(new THREE.MeshBasicMaterial({ color: COLOR_OK }))
  const com = new THREE.Mesh(new THREE.SphereGeometry(COM_RADIUS_M, 16, 12), comMat)
  const plumbMat = onTop(new THREE.LineDashedMaterial({ color: COLOR_OK, dashSize: 0.03, gapSize: 0.02 }))
  const plumb = new THREE.Line(new THREE.BufferGeometry(), plumbMat)
  const footMark = new THREE.Mesh(new THREE.RingGeometry(COM_RADIUS_M * 0.6, COM_RADIUS_M, 24), onTop(new THREE.MeshBasicMaterial({ color: COLOR_OK, side: THREE.DoubleSide })))
  footMark.rotation.x = -Math.PI / 2

  const polyMat = onTop(new THREE.MeshBasicMaterial({ color: POLYGON_COLOR, opacity: POLYGON_OPACITY, side: THREE.DoubleSide, depthWrite: false }))
  const poly = new THREE.Mesh(new THREE.BufferGeometry(), polyMat)
  const outline = new THREE.LineLoop(new THREE.BufferGeometry(), onTop(new THREE.LineBasicMaterial({ color: POLYGON_COLOR })))
  const contactGeo = new THREE.CircleGeometry(CONTACT_RADIUS_M, 12)
  contactGeo.rotateX(-Math.PI / 2)
  const contactMat = onTop(new THREE.MeshBasicMaterial({ color: CONTACT_COLOR }))
  const contacts = new THREE.Group()
  const lean = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.1, LEAN_COLOR, ARROW_HEAD_M, ARROW_HEAD_WIDTH_M)
  lean.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined
    if (m) onTop(m)
  })
  const shift = new THREE.Line(new THREE.BufferGeometry(), onTop(new THREE.LineBasicMaterial({ color: SHIFT_COLOR })))

  group.add(poly, outline, contacts, lean, shift, plumb, footMark, com)
  group.traverse((o) => (o.renderOrder = 30))

  const setColor = (c: number): void => {
    comMat.color.setHex(c)
    plumbMat.color.setHex(c)
    ;(footMark.material as THREE.MeshBasicMaterial).color.setHex(c)
  }

  return {
    group,
    update(b) {
      group.visible = b !== null
      if (!b) return
      const [x, y, z] = b.com
      com.position.set(x, y, z)
      footMark.position.set(x, GROUND_LIFT_M, z)
      plumb.geometry.dispose()
      plumb.geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z), new THREE.Vector3(x, GROUND_LIFT_M, z)])
      plumb.computeLineDistances()
      setColor(b.contacts.length === 0 ? COLOR_NO_CONTACT : b.warnings.some((w) => w.startsWith('CoM outside')) ? COLOR_WARN : COLOR_OK)

      poly.geometry.dispose()
      outline.geometry.dispose()
      const hull = b.supportPolygon
      if (hull.length >= 3) {
        // ShapeGeometry is built in the XY plane; (x, -z) then a -90° turn about X lands it on the ground at (x, z).
        const shape = new THREE.Shape(hull.map(([px, pz]) => new THREE.Vector2(px, -pz)))
        poly.geometry = new THREE.ShapeGeometry(shape)
        poly.rotation.x = -Math.PI / 2
        poly.position.y = GROUND_LIFT_M
        poly.visible = true
      } else {
        poly.geometry = new THREE.BufferGeometry()
        poly.visible = false
      }
      outline.geometry = new THREE.BufferGeometry().setFromPoints(hull.map(([px, pz]) => new THREE.Vector3(px, GROUND_LIFT_M, pz)))
      outline.visible = hull.length >= 2

      contacts.clear()
      for (const c of b.contacts) {
        const dot = new THREE.Mesh(contactGeo, contactMat)
        dot.position.set(c.at[0], GROUND_LIFT_M * 2, c.at[1])
        dot.renderOrder = 31
        contacts.add(dot)
      }

      const l = b.lean
      if (l && l.length > MIN_ARROW_M) {
        const dir = new THREE.Vector3(l.to[0] - l.from[0], 0, l.to[1] - l.from[1])
        lean.position.set(l.from[0], GROUND_LIFT_M * 3, l.from[1])
        lean.setDirection(dir.clone().normalize())
        lean.setLength(Math.max(l.length, ARROW_HEAD_M * 1.5), ARROW_HEAD_M, ARROW_HEAD_WIDTH_M)
        lean.visible = true
      } else lean.visible = false

      shift.geometry.dispose()
      const t = b.shiftTarget
      if (t && b.outsideBy > 0) {
        shift.geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(b.comGround[0], GROUND_LIFT_M * 3, b.comGround[1]),
          new THREE.Vector3(t[0], GROUND_LIFT_M * 3, t[1]),
        ])
        shift.visible = true
      } else {
        shift.geometry = new THREE.BufferGeometry()
        shift.visible = false
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose()
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => m.dispose())
        }
      })
      contactGeo.dispose()
      contactMat.dispose()
    },
  }
}
