// Primitive mannequin: Object3D hierarchy per CLAUDE.md, rebuilt from a Rig and posed from PoseState.
// `group` wraps `root` and carries the stylized override matrix, so the hierarchy itself is unchanged.
import * as THREE from 'three'
import { HAND_LENGTH_PER_PALM, SKELETON, type Rig, type Segment } from './bodyRig'
import { degToRad } from '../lib/units'
import { JOINT_EULER_ORDER, type ConfidenceLevel, type HandShape, type JointName, type PoseState, type Side } from '../types/scene'

/** Capsule tessellation: enough to read as smooth at 2000 px export. */
const CAPSULE_CAP_SEGMENTS = 6
const CAPSULE_RADIAL_SEGMENTS = 16
const SPHERE_SEGMENTS = 24
/** Capsules overlap their joints by this fraction of radius so limbs read as continuous. */
const CAPSULE_JOINT_OVERLAP = 0.5

const BODY_COLOR = 0xb8bcc4
const JOINT_COLOR = 0x7aa2d6
const JOINT_SELECTED_COLOR = 0xf59e0b
const JOINT_LOCKED_COLOR = 0xdc2626
/** Pose-solve confidence heatmap: joint spheres take the joint colour, segments a lighter limb tint. */
const CONFIDENCE_JOINT_COLOR: Record<ConfidenceLevel, number> = { green: 0x22c55e, yellow: 0xfacc15, red: 0xef4444 }
const CONFIDENCE_SEGMENT_COLOR: Record<ConfidenceLevel, number> = { green: 0xa7d8b4, yellow: 0xe8d98f, red: 0xe6a1a1 }

export type ConfidenceMap = Partial<Record<JointName, ConfidenceLevel>>
const Y_AXIS = new THREE.Vector3(0, 1, 0)

// ---- Fingers: visual primitives under each hand node (not joints) ----
const FINGER_COUNT = 4
/** Finger width as a fraction of its share of palm width (leaves gaps). */
const FINGER_WIDTH_FILL = 0.85
/** Finger thickness relative to palm thickness. */
const FINGER_THICKNESS = 0.8
/** Proximal and distal phalanx lengths as fractions of total finger length (hand minus palm). */
const PROXIMAL_SHARE = 0.55
const DISTAL_SHARE = 0.45
/** Thumb: base this far down the palm (fraction of palm length), length relative to palm. */
const THUMB_BASE_DOWN = 0.3
const THUMB_LENGTH = 0.6
const THUMB_WIDTH = 0.28
/** Thumb rests angled toward the front of the hand by this much. */
const THUMB_REST_SPREAD_DEG = 30

/** Curl per phalanx in degrees, [proximal, distal] for index..pinky, plus thumb curl. */
interface HandShapeDef {
  fingers: readonly (readonly [number, number])[]
  thumb: number
}
const relaxed = [20, 25] as const
const curled = [90, 100] as const
export const HAND_SHAPE_DEFS: Record<HandShape, HandShapeDef> = {
  relaxed: { fingers: [relaxed, relaxed, relaxed, relaxed], thumb: 15 },
  open: { fingers: [[0, 0], [0, 0], [0, 0], [0, 0]], thumb: 0 },
  fist: { fingers: [curled, curled, curled, curled], thumb: 60 },
  pointing: { fingers: [[0, 0], curled, curled, curled], thumb: 50 },
  gripping: { fingers: [[55, 55], [55, 55], [55, 55], [55, 55]], thumb: 35 },
}

interface Finger {
  proximal: THREE.Object3D
  distal: THREE.Object3D
  meshes: [THREE.Mesh, THREE.Mesh]
}

interface Hand {
  fingers: Finger[]
  thumb: { pivot: THREE.Object3D; mesh: THREE.Mesh }
  resize: (palm: [number, number, number]) => void
  setShape: (shape: HandShape) => void
}

function createHand(node: THREE.Object3D, side: Side, joint: JointName, mat: THREE.Material, pickables: THREE.Mesh[]): Hand {
  // Palms face the body's mid-line (left palm faces -X), so curling toward the palm is -rz on the left.
  const curlSign = side === 'L' ? -1 : 1
  const mesh = (): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), mat)
    m.userData['joint'] = joint
    pickables.push(m)
    return m
  }
  const fingers: Finger[] = []
  for (let i = 0; i < FINGER_COUNT; i++) {
    const proximal = new THREE.Object3D()
    const distal = new THREE.Object3D()
    const m0 = mesh()
    const m1 = mesh()
    proximal.add(m0, distal)
    distal.add(m1)
    node.add(proximal)
    fingers.push({ proximal, distal, meshes: [m0, m1] })
  }
  const thumbPivot = new THREE.Object3D()
  const thumbMesh = mesh()
  thumbPivot.add(thumbMesh)
  node.add(thumbPivot)

  return {
    fingers,
    thumb: { pivot: thumbPivot, mesh: thumbMesh },
    resize([t, len, w]) {
      const fingerLen = len * (HAND_LENGTH_PER_PALM - 1)
      const fw = (w / FINGER_COUNT) * FINGER_WIDTH_FILL
      const ft = t * FINGER_THICKNESS
      const l0 = fingerLen * PROXIMAL_SHARE
      const l1 = fingerLen * DISTAL_SHARE
      fingers.forEach((f, i) => {
        // Index finger at the front (+Z), pinky at the back.
        const z = w / 2 - (w / FINGER_COUNT) * (i + 0.5)
        f.proximal.position.set(0, -len, z)
        f.distal.position.set(0, -l0, 0)
        for (const [m, l] of [[f.meshes[0], l0], [f.meshes[1], l1]] as const) {
          m.geometry.dispose()
          m.geometry = new THREE.BoxGeometry(ft, l, fw)
          m.position.set(0, -l / 2, 0)
        }
      })
      const thumbLen = len * THUMB_LENGTH
      thumbPivot.position.set(0, -len * THUMB_BASE_DOWN, w / 2)
      thumbMesh.geometry.dispose()
      thumbMesh.geometry = new THREE.BoxGeometry(ft, thumbLen, w * THUMB_WIDTH)
      thumbMesh.position.set(0, -thumbLen / 2, 0)
    },
    setShape(shape) {
      const def = HAND_SHAPE_DEFS[shape]
      fingers.forEach((f, i) => {
        const [a, b] = def.fingers[i] ?? [0, 0]
        f.proximal.rotation.set(0, 0, curlSign * degToRad(a))
        f.distal.rotation.set(0, 0, curlSign * degToRad(b))
      })
      thumbPivot.rotation.set(-degToRad(THUMB_REST_SPREAD_DEG), 0, curlSign * degToRad(def.thumb), 'XYZ')
    },
  }
}

export interface Mannequin {
  /** Outer group: carries the stylized override matrix. Add this to the scene. */
  group: THREE.Group
  root: THREE.Object3D
  nodes: Record<JointName, THREE.Object3D>
  /** Meshes for picking; each has userData.joint = JointName. */
  pickables: THREE.Mesh[]
  applyRig: (rig: Rig) => void
  applyPose: (pose: PoseState) => void
  /** Column-major 4x4, or null for none. */
  applyStylize: (matrix: number[] | null) => void
  setSelected: (joint: JointName | null) => void
  setLocked: (joints: ReadonlySet<JointName>) => void
  /** Viewport-only heatmap (null clears it): per-joint colours for the spheres, per-limb tints for the segments. */
  setConfidence: (joints: ConfidenceMap | null, segments: ConfidenceMap | null) => void
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
  const jointLockMat = new THREE.MeshStandardMaterial({ color: JOINT_LOCKED_COLOR, roughness: 0.5, emissive: 0x3a0000 })
  const levels = ['green', 'yellow', 'red'] as const
  const confJointMat = Object.fromEntries(levels.map((l) => [l, new THREE.MeshStandardMaterial({ color: CONFIDENCE_JOINT_COLOR[l], roughness: 0.5 })])) as Record<ConfidenceLevel, THREE.MeshStandardMaterial>
  const confSegMat = Object.fromEntries(levels.map((l) => [l, new THREE.MeshStandardMaterial({ color: CONFIDENCE_SEGMENT_COLOR[l], roughness: 0.65, metalness: 0 })])) as Record<ConfidenceLevel, THREE.MeshStandardMaterial>

  const group = new THREE.Group()
  group.name = 'mannequin'
  group.matrixAutoUpdate = false
  const root = new THREE.Object3D()
  root.name = 'root'
  group.add(root)
  const nodes = {} as Record<JointName, THREE.Object3D>
  const segMeshes = {} as Record<JointName, THREE.Mesh>
  const jointMeshes = {} as Record<JointName, THREE.Mesh>
  const pickables: THREE.Mesh[] = []
  const hands = {} as Record<Side, Hand>

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
  for (const side of ['L', 'R'] as const) hands[side] = createHand(nodes[`hand${side}`], side, `hand${side}`, bodyMat, pickables)

  let selected: JointName | null = null
  let locked: ReadonlySet<JointName> = new Set()
  let jointConf: ConfidenceMap = {}
  const materialFor = (j: JointName): THREE.Material => {
    if (j === selected) return jointSelMat
    if (locked.has(j)) return jointLockMat
    const c = jointConf[j]
    return c ? confJointMat[c] : jointMat
  }
  const refreshJoint = (j: JointName): void => {
    jointMeshes[j].material = materialFor(j)
  }

  return {
    group,
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
      for (const side of ['L', 'R'] as const) {
        const palm = rig[`hand${side}`].segment
        if (palm.shape === 'box') hands[side].resize(palm.size)
      }
    },

    applyPose(pose) {
      for (const def of SKELETON) {
        const r = pose.joints[def.name]
        nodes[def.name].rotation.set(r.rx, r.ry, r.rz, JOINT_EULER_ORDER)
      }
      root.position.set(...pose.rootTransform.position)
      root.rotation.set(...pose.rootTransform.rotation, JOINT_EULER_ORDER)
      hands.L.setShape(pose.hands.L)
      hands.R.setShape(pose.hands.R)
    },

    applyStylize(matrix) {
      if (matrix && matrix.length === 16) group.matrix.fromArray(matrix)
      else group.matrix.identity()
      group.matrixWorldNeedsUpdate = true
    },

    setSelected(joint) {
      const prev = selected
      selected = joint
      if (prev) refreshJoint(prev)
      if (joint) refreshJoint(joint)
    },

    setLocked(joints) {
      const prev = locked
      locked = joints
      for (const j of prev) refreshJoint(j)
      for (const j of joints) refreshJoint(j)
    },

    setConfidence(joints, segments) {
      jointConf = joints ?? {}
      for (const def of SKELETON) {
        refreshJoint(def.name)
        const c = segments?.[def.name]
        segMeshes[def.name].material = c ? confSegMat[c] : bodyMat
      }
    },

    dispose() {
      for (const m of pickables) m.geometry.dispose()
      for (const l of levels) {
        confJointMat[l].dispose()
        confSegMat[l].dispose()
      }
      bodyMat.dispose()
      jointMat.dispose()
      jointSelMat.dispose()
      jointLockMat.dispose()
    },
  }
}
