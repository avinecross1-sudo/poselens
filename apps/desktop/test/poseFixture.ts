// Synthetic landmark fixture for the pose solve: a known pose on the default body, seen through a known
// shot camera. Landmarks are projected through the real render path (applyShotCamera + THREE.Vector3.project),
// not through src/solve/projection.ts, so the solver is checked against what the viewport would draw.
import * as THREE from 'three'
import { applyShotCamera } from '../src/three/cameraRig'
import { computeRig, type Rig } from '../src/three/bodyRig'
import { forwardKinematics, jointPosition } from '../src/solve/fk'
import { groundPose } from '../src/solve/retarget'
import { LANDMARKS, type DepthHint, type LandmarkId } from '../src/solve/landmarks'
import { defaultBody, defaultPose } from '../src/state/defaults'
import { getLibraryPose } from '../src/state/poseLibrary'
import type { CameraState, JointName, JointRotation, PoseState, Vec2, Vec3 } from '../src/types/scene'

export const FIXTURE_ASPECT = 2 / 3

export interface PoseFixture {
  rig: Rig
  camera: CameraState
  truth: PoseState
  /** World positions of every landmark's point (crown and chin on the head sphere). */
  points: Record<LandmarkId, THREE.Vector3>
  /** Frame space. */
  landmarks: Record<LandmarkId, Vec2>
  /** The hints an artist reading the drawing would give (nearer or farther than the parent anchor). */
  hints: Partial<Record<LandmarkId, DepthHint>>
}

/** Anchor each landmark is depth-resolved from, as the artist would judge "in front of / behind". */
const ANCHOR: Partial<Record<LandmarkId, LandmarkId | 'hipCenter'>> = {
  neck: 'hipCenter',
  head: 'neck',
  hipL: 'hipCenter',
  shoulderL: 'neck',
  shoulderR: 'neck',
  elbowL: 'shoulderL',
  elbowR: 'shoulderR',
  wristL: 'elbowL',
  wristR: 'elbowR',
  kneeL: 'hipL',
  kneeR: 'hipR',
  ankleL: 'kneeL',
  ankleR: 'kneeR',
  toeL: 'ankleL',
  toeR: 'ankleR',
}

export interface FixtureOpts {
  poseId?: string
  yawDeg?: number
  camera?: Partial<CameraState>
  /** Joint rotations (radians) laid over the library pose, for poses the library does not have. */
  joints?: Partial<Record<JointName, JointRotation>>
  /** Whole-body tilt (radians, XYZ) for falls and dives; overrides the yaw-only root rotation. */
  rootRotation?: Vec3
  /** Height (m) of the lowest body point above the ground; defaults to the library pose's lift. */
  lift?: number
}

export function buildFixture(opts: FixtureOpts = {}): PoseFixture {
  const body = defaultBody()
  const rig = computeRig(body.sliders, body.asymmetry)
  const lib = getLibraryPose(opts.poseId ?? 'run-1')
  if (!lib) throw new Error('missing library pose')
  const yaw = ((opts.yawDeg ?? 25) * Math.PI) / 180
  const start: PoseState = {
    ...defaultPose(),
    joints: { ...lib.joints, ...opts.joints },
    rootTransform: { position: [0.2, 0, -0.3], rotation: opts.rootRotation ?? [0, yaw, 0] },
  }
  const truth = groundPose(rig, start, opts.lift ?? lib.lift)
  const camera: CameraState = {
    position: [0.6, 1.45, 4.3],
    target: [0, 0.95, 0],
    up: [0, 1, 0],
    focal: 40,
    sensorHeight: 24,
    roll: 0.03,
    preset: 'custom',
    ...opts.camera,
  }
  const world = forwardKinematics(rig, truth.joints, truth.rootTransform)
  const seg = rig.head.segment
  const hc = seg.shape === 'sphere' ? seg.center[1] : 0
  const hr = seg.shape === 'sphere' ? seg.radius : 0
  const at = (j: JointName): THREE.Vector3 => jointPosition(world, j)
  const headPt = (y: number): THREE.Vector3 => new THREE.Vector3(0, y, 0).applyMatrix4(world.head)
  const points = {} as Record<LandmarkId, THREE.Vector3>
  for (const id of Object.keys(LANDMARKS) as LandmarkId[]) points[id] = at(LANDMARKS[id].joint)
  points.head = headPt(hc + hr)
  points.chin = headPt(hc - hr)
  points.gaze = headPt(hc).add(new THREE.Vector3(0, 0, 1).transformDirection(world.head).multiplyScalar(1.5))

  const cam = new THREE.PerspectiveCamera()
  applyShotCamera(cam, camera, FIXTURE_ASPECT)
  const landmarks = {} as Record<LandmarkId, Vec2>
  for (const id of Object.keys(points) as LandmarkId[]) {
    const ndc = points[id].clone().project(cam)
    landmarks[id] = [(ndc.x * FIXTURE_ASPECT) / 2, ndc.y / 2]
  }

  // Hints: is the point nearer the camera along its ray than the anchor's closest point on that ray?
  const eye = new THREE.Vector3(...camera.position)
  const hipCenter = at('thighL').add(at('thighR')).multiplyScalar(0.5)
  const hints: Partial<Record<LandmarkId, DepthHint>> = {}
  for (const [id, anchorId] of Object.entries(ANCHOR) as [LandmarkId, LandmarkId | 'hipCenter'][]) {
    const anchor = anchorId === 'hipCenter' ? hipCenter : points[anchorId]
    const p = points[id]
    const dir = p.clone().sub(eye).normalize()
    hints[id] = p.clone().sub(eye).dot(dir) < anchor.clone().sub(eye).dot(dir) ? 'toward' : 'away'
  }
  return { rig, camera, truth, points, landmarks, hints }
}

export const vec = (v: Vec3): THREE.Vector3 => new THREE.Vector3(...v)
