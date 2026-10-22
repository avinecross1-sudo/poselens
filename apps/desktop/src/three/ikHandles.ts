// IK drag handles at each wrist and ankle. Dragging moves a target on a camera-facing plane through
// the handle; the store solves CCD IK for that chain (src/solve/ik.ts). Hidden in exports.
import * as THREE from 'three'
import { IK_CHAIN_IDS, IK_CHAINS, type IkChainId } from '../solve/ik'
import type { Mannequin } from './mannequin'

const HANDLE_RADIUS_M = 0.035
const HANDLE_COLOR = 0x22d3ee
const HANDLE_HOVER_COLOR = 0xa5f3fc
const HANDLE_LOCKED_COLOR = 0x71717a
const HANDLE_OPACITY = 0.85

export interface IkHandleCallbacks {
  onDrag: (chain: IkChainId, target: THREE.Vector3) => void
  onDragEnd: () => void
  onDraggingChanged: (dragging: boolean) => void
}

export interface IkHandles {
  group: THREE.Group
  /** Re-centres handles on the current wrist/ankle positions; call each frame. */
  update: () => void
  setState: (visible: Record<IkChainId, boolean>, locked: ReadonlySet<IkChainId>) => void
  isDragging: () => boolean
  dispose: () => void
}

export function createIkHandles(mannequin: Mannequin, getCamera: () => THREE.Camera, dom: HTMLElement, cb: IkHandleCallbacks): IkHandles {
  const group = new THREE.Group()
  group.name = 'ik-handles'
  const geo = new THREE.SphereGeometry(HANDLE_RADIUS_M, 16, 12)
  const meshes = {} as Record<IkChainId, THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>
  for (const id of IK_CHAIN_IDS) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: HANDLE_COLOR, depthTest: false, transparent: true, opacity: HANDLE_OPACITY }))
    m.renderOrder = 30
    m.userData['chain'] = id
    meshes[id] = m
    group.add(m)
  }

  let locked: ReadonlySet<IkChainId> = new Set()
  let dragging: { chain: IkChainId; plane: THREE.Plane; offset: THREE.Vector3; pointerId: number } | null = null
  let hovered: IkChainId | null = null
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const tmp = new THREE.Vector3()

  const colorize = (): void => {
    for (const id of IK_CHAIN_IDS) {
      meshes[id].material.color.setHex(locked.has(id) ? HANDLE_LOCKED_COLOR : id === hovered || dragging?.chain === id ? HANDLE_HOVER_COLOR : HANDLE_COLOR)
    }
  }

  const rayFrom = (e: PointerEvent): THREE.Raycaster => {
    const rect = dom.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, getCamera())
    return raycaster
  }

  const pick = (e: PointerEvent): IkChainId | null => {
    const visible = IK_CHAIN_IDS.map((id) => meshes[id]).filter((m) => m.visible && group.visible)
    const hit = rayFrom(e).intersectObjects(visible, false)[0]
    return (hit?.object.userData['chain'] as IkChainId | undefined) ?? null
  }

  // Capture phase on the canvas runs before OrbitControls and the joint gizmo, so a handle drag
  // never also orbits the editor camera or changes the selection.
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    const chain = pick(e)
    if (!chain || locked.has(chain)) return
    e.stopImmediatePropagation()
    e.preventDefault()
    const handlePos = meshes[chain].getWorldPosition(new THREE.Vector3())
    const normal = getCamera().getWorldDirection(new THREE.Vector3())
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, handlePos)
    const hitPoint = rayFrom(e).ray.intersectPlane(plane, new THREE.Vector3()) ?? handlePos.clone()
    dragging = { chain, plane, offset: handlePos.clone().sub(hitPoint), pointerId: e.pointerId }
    dom.setPointerCapture(e.pointerId)
    cb.onDraggingChanged(true)
    colorize()
  }

  const onPointerMove = (e: PointerEvent): void => {
    if (dragging) {
      e.stopImmediatePropagation()
      const p = rayFrom(e).ray.intersectPlane(dragging.plane, tmp)
      if (p) cb.onDrag(dragging.chain, p.clone().add(dragging.offset))
      return
    }
    const h = pick(e)
    if (h !== hovered) {
      hovered = h
      dom.style.cursor = h && !locked.has(h) ? 'grab' : ''
      colorize()
    }
  }

  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragging.pointerId) return
    e.stopImmediatePropagation()
    if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId)
    dragging = null
    cb.onDragEnd()
    cb.onDraggingChanged(false)
    colorize()
  }

  dom.addEventListener('pointerdown', onPointerDown, { capture: true })
  dom.addEventListener('pointermove', onPointerMove, { capture: true })
  dom.addEventListener('pointerup', onPointerUp, { capture: true })

  return {
    group,
    update() {
      for (const id of IK_CHAIN_IDS) mannequin.nodes[IK_CHAINS[id].effector].getWorldPosition(meshes[id].position)
    },
    setState(visible, lockedChains) {
      locked = lockedChains
      for (const id of IK_CHAIN_IDS) meshes[id].visible = visible[id]
      colorize()
    },
    isDragging: () => dragging !== null,
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown, { capture: true })
      dom.removeEventListener('pointermove', onPointerMove, { capture: true })
      dom.removeEventListener('pointerup', onPointerUp, { capture: true })
      geo.dispose()
      for (const id of IK_CHAIN_IDS) meshes[id].material.dispose()
    },
  }
}
