// Ground plane, grid and horizon line. None of these are exported to PNG.
import * as THREE from 'three'

export const GROUND_SIZE_M = 40
export const GRID_DIVISIONS = 40
/**
 * Horizon = vanishing line of the ground plane. Every point at the camera's own height projects onto it,
 * so we draw a ring at eye height around the camera. Radius only has to sit inside the far plane.
 */
export const HORIZON_RADIUS_M = 400
const HORIZON_SEGMENTS = 256
const HORIZON_COLOR = 0x38bdf8

export interface Helpers {
  group: THREE.Group
  ground: THREE.Mesh
  grid: THREE.GridHelper
  horizon: THREE.LineLoop
  /** Re-centres the horizon ring on the camera at its eye height. */
  updateHorizon: (cameraPosition: THREE.Vector3) => void
  dispose: () => void
}

export function createHelpers(): Helpers {
  const group = new THREE.Group()
  group.name = 'helpers'

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 1, transparent: true, opacity: 0.6 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.001 // just under the grid to avoid z-fighting
  group.add(ground)

  const grid = new THREE.GridHelper(GROUND_SIZE_M, GRID_DIVISIONS, 0x71717a, 0x52525b)
  group.add(grid)

  const pts: THREE.Vector3[] = []
  for (let i = 0; i < HORIZON_SEGMENTS; i++) {
    const a = (i / HORIZON_SEGMENTS) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * HORIZON_RADIUS_M, 0, Math.sin(a) * HORIZON_RADIUS_M))
  }
  const horizon = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: HORIZON_COLOR, depthTest: false, transparent: true }),
  )
  horizon.renderOrder = 10
  horizon.frustumCulled = false
  group.add(horizon)

  return {
    group,
    ground,
    grid,
    horizon,
    updateHorizon(p) {
      horizon.position.copy(p)
    },
    dispose() {
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      grid.dispose()
      horizon.geometry.dispose()
      ;(horizon.material as THREE.Material).dispose()
    },
  }
}
