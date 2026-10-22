// Joint picking + rotation gizmo. Forward kinematics only: the gizmo rotates one node in local space.
import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { JOINT_EULER_ORDER, type JointName, type JointRotation } from '../types/scene'
import type { Mannequin } from './mannequin'

/** A press that moves farther than this (px) is an orbit drag, not a click-to-select. */
const CLICK_MOVE_TOLERANCE_PX = 4
const GIZMO_SIZE = 0.7

export interface JointGizmoCallbacks {
  onSelect: (joint: JointName | null) => void
  /** Live rotation during a drag (preview). */
  onRotate: (joint: JointName, rot: JointRotation) => void
  /** Drag released: commit one undo step. */
  onRotateEnd: () => void
  onDraggingChanged: (dragging: boolean) => void
}

export interface JointGizmo {
  helper: THREE.Object3D
  attach: (joint: JointName | null) => void
  setCamera: (camera: THREE.Camera) => void
  /** True while the pointer is over or dragging a gizmo handle. */
  isActive: () => boolean
  dispose: () => void
}

export function createJointGizmo(
  mannequin: Mannequin,
  getCamera: () => THREE.Camera,
  dom: HTMLElement,
  cb: JointGizmoCallbacks,
): JointGizmo {
  const controls = new TransformControls(getCamera(), dom)
  controls.setMode('rotate')
  controls.setSpace('local')
  controls.setSize(GIZMO_SIZE)
  const helper = controls.getHelper()

  let attached: JointName | null = null

  controls.addEventListener('dragging-changed', (e) => {
    const dragging = Boolean((e as unknown as { value: boolean }).value)
    cb.onDraggingChanged(dragging)
    if (!dragging) cb.onRotateEnd()
  })
  controls.addEventListener('objectChange', () => {
    if (!attached) return
    const r = mannequin.nodes[attached].rotation
    r.reorder(JOINT_EULER_ORDER)
    cb.onRotate(attached, { rx: r.x, ry: r.y, rz: r.z })
  })

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let downAt: { x: number; y: number } | null = null

  const onPointerDown = (e: PointerEvent): void => {
    downAt = e.button === 0 && controls.axis === null ? { x: e.clientX, y: e.clientY } : null
  }
  const onPointerUp = (e: PointerEvent): void => {
    if (!downAt) return
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
    downAt = null
    if (moved > CLICK_MOVE_TOLERANCE_PX) return
    const rect = dom.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, getCamera())
    const hit = raycaster.intersectObjects(mannequin.pickables, false)[0]
    cb.onSelect((hit?.object.userData['joint'] as JointName | undefined) ?? null)
  }
  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointerup', onPointerUp)

  return {
    helper,
    attach(joint) {
      attached = joint
      if (joint) controls.attach(mannequin.nodes[joint])
      else controls.detach()
    },
    setCamera(camera) {
      controls.camera = camera
    },
    isActive: () => controls.dragging || controls.axis !== null,
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointerup', onPointerUp)
      controls.detach()
      controls.dispose()
    },
  }
}
