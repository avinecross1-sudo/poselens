// Anatomy look: colour-coded body masses parented to the mannequin's bone nodes, so they pose with it.
// The layer only adds its own meshes and, while on, hides the grey segments, tints the hands and hides joint
// markers in their plain colour (selected, locked and confidence-coloured markers stay). Picking is untouched:
// rays still hit the hidden segments and markers underneath.
import * as THREE from 'three'
import type { Rig } from '../bodyRig'
import type { Mannequin } from '../mannequin'
import type { JointName } from '../../types/scene'
import { MUSCLE_COLORS, placeMuscles, spindleRadius, type MuscleColor, type SpindleProfile } from './muscles'

/** Lathe tessellation: smooth at 2000 px export without making the forms heavy. */
const PROFILE_STEPS = 14
const RADIAL_SEGMENTS = 20
/** Matte, clay-like finish. */
const MUSCLE_ROUGHNESS = 0.8
/** Hands keep the mannequin's posable palm and fingers, tinted to match the figure. */
const HAND_COLOR: MuscleColor = 'hand'
const ANATOMY_TAG = 'anatomy'
/** mannequin.ts draws joint markers with this render order; it is how the layer tells them from segments. */
const JOINT_MARKER_RENDER_ORDER = 1

export interface AnatomyLayer {
  applyRig: (rig: Rig) => void
  setEnabled: (on: boolean) => void
  /** Re-hides segments and re-tints hands; call after anything that may have reset mannequin materials. */
  enforce: () => void
  dispose: () => void
}

function spindleGeometry(p: SpindleProfile): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= PROFILE_STEPS; i++) {
    const t = i / PROFILE_STEPS
    pts.push(new THREE.Vector2(spindleRadius(t, p), t - 0.5))
  }
  return new THREE.LatheGeometry(pts, RADIAL_SEGMENTS)
}

export function createAnatomyLayer(mannequin: Mannequin): AnatomyLayer {
  const materials = Object.fromEntries(
    (Object.keys(MUSCLE_COLORS) as MuscleColor[]).map((c) => [c, new THREE.MeshStandardMaterial({ color: MUSCLE_COLORS[c], roughness: MUSCLE_ROUGHNESS, metalness: 0 })]),
  ) as Record<MuscleColor, THREE.MeshStandardMaterial>
  const geometries = new Map<string, THREE.BufferGeometry>()
  const geometryFor = (p: SpindleProfile): THREE.BufferGeometry => {
    const key = `${p.peak}|${p.ends}`
    let g = geometries.get(key)
    if (!g) geometries.set(key, (g = spindleGeometry(p)))
    return g
  }

  const groups = new Map<JointName, THREE.Group>()
  const groupFor = (bone: JointName): THREE.Group => {
    let g = groups.get(bone)
    if (!g) {
      g = new THREE.Group()
      g.name = `anatomy-${bone}`
      g.userData[ANATOMY_TAG] = true
      g.visible = enabled
      mannequin.nodes[bone].add(g)
      groups.set(bone, g)
    }
    return g
  }
  const meshes = new Map<string, THREE.Mesh>()
  const handNodes = new Set<THREE.Object3D>([mannequin.nodes.handL, mannequin.nodes.handR])
  /** Mannequin meshes this layer re-tinted, with the material to give back. */
  const tinted = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  let enabled = false

  /** Mannequin meshes (not this layer's), with whether each is a joint marker and whether it belongs to a hand. */
  const bodyMeshes = (): { mesh: THREE.Mesh; marker: boolean; hand: boolean }[] => {
    const out: { mesh: THREE.Mesh; marker: boolean; hand: boolean }[] = []
    const walk = (o: THREE.Object3D, inHand: boolean): void => {
      if (o.userData[ANATOMY_TAG]) return
      const hand = inHand || handNodes.has(o)
      if (o instanceof THREE.Mesh) out.push({ mesh: o, marker: o.renderOrder === JOINT_MARKER_RENDER_ORDER, hand })
      for (const c of o.children) walk(c, hand)
    }
    walk(mannequin.root, false)
    return out
  }
  /** The plain joint-marker material: the one most markers share when the layer is created. */
  const plainMarker = ((): THREE.Material | THREE.Material[] | null => {
    const counts = new Map<THREE.Material | THREE.Material[], number>()
    for (const b of bodyMeshes()) if (b.marker) counts.set(b.mesh.material, (counts.get(b.mesh.material) ?? 0) + 1)
    let best: THREE.Material | THREE.Material[] | null = null
    for (const [m, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = m
    return best
  })()

  const layer: AnatomyLayer = {
    applyRig(rig) {
      for (const m of placeMuscles(rig)) {
        let mesh = meshes.get(m.id)
        if (!mesh) {
          mesh = new THREE.Mesh(geometryFor(m.profile), materials[m.color])
          mesh.name = m.id
          groupFor(m.bone).add(mesh)
          meshes.set(m.id, mesh)
        }
        mesh.position.set(...m.center)
        mesh.rotation.set(...m.rot, 'XYZ')
        mesh.scale.set(...m.size)
      }
    },

    setEnabled(on) {
      if (on === enabled) return
      enabled = on
      for (const g of groups.values()) g.visible = on
      if (!on) {
        for (const [mesh, mat] of tinted) mesh.material = mat
        tinted.clear()
        for (const b of bodyMeshes()) b.mesh.visible = true
      }
      layer.enforce()
    },

    enforce() {
      if (!enabled) return
      const handMat = materials[HAND_COLOR]
      for (const { mesh, marker, hand } of bodyMeshes()) {
        if (marker) mesh.visible = mesh.material !== plainMarker
        else if (!hand) mesh.visible = false
        else if (mesh.material !== handMat) {
          tinted.set(mesh, mesh.material)
          mesh.material = handMat
        }
      }
    },

    dispose() {
      for (const g of groups.values()) g.removeFromParent()
      for (const g of geometries.values()) g.dispose()
      for (const m of Object.values(materials)) m.dispose()
    },
  }
  return layer
}
