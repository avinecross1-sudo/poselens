// Primitive mannequin: Object3D hierarchy per CLAUDE.md, rebuilt from a Rig and posed from PoseState.
import * as THREE from 'three'
import { JOINT_EULER_ORDER, type JointName, type PoseState } from '../types/scene'
import { SKELETON, type Rig, type Segment } from './bodyRig'

/** Capsule tessellation: enough to read as smooth at 2000 px export. */
const CAPSULE_CAP_SEGMENTS = 6
const CAPSULE_RADIAL_SEGMENTS = 16
const SPHERE_SEGMENTS = 24
/** Capsules overlap their joints by this fraction of radius so limbs read as continuous. */
const CAPSULE_JOINT_OVERLAP = 0.5

const BODY_COLOR = 0xb8bcc4
const JOINT_COLOR = 0x7aa2d6
const JOINT_SELECTED_COLOR = 0xf59e0b
const Y_AXIS = new THREE.Vector3(0, 1, 0)

export interface Mannequin {
  root: THREE.Object3D
  nodes: Record<JointName, THREE.Object3D>
  /** Meshes for picking; each has userData.joint = JointName. */
  pickables: THREE.Mesh[]
  applyRig: (rig: Rig) => void
  applyPose: (pose: PoseState) => void
  setSelected: (joint: JointName | null) => void
  dispose: () => void
}

function segmentGeometry(seg: Segment): THREE.BufferGeometry {
  switch (seg.shape) {
    case 'capsule': {
      const mid = Math.max(seg.length - seg.radius * 2 * (1 - CAPSULE_JOINT_OVERLAP), 0.001)
      return new THREE.CapsuleGeometry(seg.radius, mid, CAPSULE_CAP_SEGMENTS, CAPSULE_RADIAL_SEGMENTS)
    }
    case 'box':
      return new THREE.BoxGeometry(seg.size[0], seg.size[1], seg.size[2])
    case 'sphere':
      return new THREE.SphereGeometry(seg.radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS / 2)
  }
}

function placeSegment(mesh: THREE.Mesh, seg: Segment): void {
  mesh.quaternion.identity()
  if (seg.shape === 'capsule') {
    const dir = new THREE.Vector3(...seg.dir).normalize()
    mesh.position.copy(dir).multiplyScalar(seg.length / 2)
    mesh.quaternion.setFromUnitVectors(Y_AXIS, dir)
  } else {
    mesh.position.set(...seg.center)
  }
}

export function createMannequin(): Mannequin {
  const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.65, metalness: 0 })
  const jointMat = new THREE.MeshStandardMaterial({ color: JOINT_COLOR, roughness: 0.5 })
  const jointSelMat = new THREE.MeshStandardMaterial({ color: JOINT_SELECTED_COLOR, roughness: 0.5, emissive: 0x4a2a00 })

  const root = new THREE.Object3D()
  root.name = 'root'
  const nodes = {} as Record<JointName, THREE.Object3D>
  const segMeshes = {} as Record<JointName, THREE.Mesh>
  const jointMeshes = {} as Record<JointName, THREE.Mesh>
  const pickables: THREE.Mesh[] = []

  for (const def of SKELETON) {
    const node = new THREE.Object3D()
    node.name = def.name
    node.rotation.order = JOINT_EULER_ORDER
    const parent = def.parent === 'root' ? root : nodes[def.parent]
    parent.add(node)
    nodes[def.name] = node

    const seg = new THREE.Mesh(new THREE.BufferGeometry(), bodyMat)
    seg.userData['joint'] = def.name
    node.add(seg)
    segMeshes[def.name] = seg

    const joint = new THREE.Mesh(new THREE.BufferGeometry(), jointMat)
    joint.userData['joint'] = def.name
    joint.renderOrder = 1
    node.add(joint)
    jointMeshes[def.name] = joint

    pickables.push(joint, seg)
  }

  let selected: JointName | null = null

  return {
    root,
    nodes,
    pickables,

    applyRig(rig) {
      for (const def of SKELETON) {
        const bone = rig[def.name]
        nodes[def.name].position.set(...bone.offset)
        const seg = segMeshes[def.name]
        seg.geometry.dispose()
        seg.geometry = segmentGeometry(bone.segment)
        placeSegment(seg, bone.segment)
        const joint = jointMeshes[def.name]
        joint.geometry.dispose()
        joint.geometry = new THREE.SphereGeometry(bone.jointRadius, SPHERE_SEGMENTS / 2, SPHERE_SEGMENTS / 4)
      }
    },

    applyPose(pose) {
      for (const def of SKELETON) {
        const r = pose.joints[def.name]
        nodes[def.name].rotation.set(r.rx, r.ry, r.rz, JOINT_EULER_ORDER)
      }
      root.position.set(...pose.rootTransform.position)
      root.rotation.set(...pose.rootTransform.rotation, JOINT_EULER_ORDER)
    },

    setSelected(joint) {
      if (selected) jointMeshes[selected].material = jointMat
      selected = joint
      if (joint) jointMeshes[joint].material = jointSelMat
    },

    dispose() {
      for (const m of pickables) m.geometry.dispose()
      bodyMat.dispose()
      jointMat.dispose()
      jointSelMat.dispose()
    },
  }
}
