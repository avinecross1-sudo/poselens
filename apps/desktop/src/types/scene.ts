// Shared scene + metadata types. See docs/metadata-schema.md.

export const SCHEMA_VERSION = 1 as const

/** Joint rotations are stored as rx/ry/rz radians applied in this Euler order. */
export const JOINT_EULER_ORDER = 'XYZ' as const

export type Vec2 = [number, number]
export type Vec3 = [number, number, number]

/** Nodes of the mannequin hierarchy (CLAUDE.md). `root` is driven by pose.rootTransform. */
export const JOINT_NAMES = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'forearmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'forearmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'toeL',
  'thighR',
  'shinR',
  'footR',
  'toeR',
] as const

export type JointName = (typeof JOINT_NAMES)[number]

export interface JointRotation {
  rx: number
  ry: number
  rz: number
}

export interface BodySliders {
  height: number
  mass: number
  muscle: number
  softness: number
  shoulderHipRatio: number
}

export interface StylizedOverride {
  matrix: number[]
  acknowledged: boolean
}

export interface BodyState {
  presetId: string
  modifiedFrom: string | null
  sliders: BodySliders
  locks: Record<string, boolean>
  asymmetry: Record<string, number>
  stylizedOverride: StylizedOverride | null
}

export interface RootTransform {
  position: Vec3
  rotation: Vec3
}

export interface PoseState {
  joints: Record<JointName, JointRotation>
  rootTransform: RootTransform
  ikLocks: string[]
  jointLocks: string[]
  depthNudges: Record<string, number>
}

export interface CameraState {
  position: Vec3
  target: Vec3
  up: Vec3
  focal: number
  sensorHeight: number
  roll: number
  preset: string
}

export interface SceneSettings {
  canvasRatio: number
  groundPlane: boolean
  grid: boolean
  horizon: boolean
}

export interface ExportSettings {
  preset: string
  namingTemplate: string
  settings: { widthPx: number }
}

// ---- Types for later phases (no slices yet; written as empty defaults) ----

export type ConfidenceLevel = 'green' | 'yellow' | 'red'

export interface SketchMeta {
  hash: string | null
  path: string | null
  alignment: { x: number; y: number; scale: number; rotation: number }
  landmarks: Record<string, Vec2>
  horizon: [Vec2, Vec2] | null
  vps: Vec2[]
  solve: { settings: Record<string, unknown>; confidence: Record<string, ConfidenceLevel>; baked: boolean }
}

export interface BalanceMeta {
  com: Vec3 | null
  supportPolygon: Vec2[]
  contacts: string[]
  warnings: string[]
}

export interface Variant {
  id: string
  name: string
  camera: Partial<CameraState>
  pose: Partial<PoseState>
}

export interface ClipboardEntry<T> {
  value: T
  provenance: { sceneName: string; copiedAt: string }
}

export interface ClipboardState {
  camera?: ClipboardEntry<CameraState>
  body?: ClipboardEntry<BodyState>
  pose?: ClipboardEntry<PoseState>
}

// ---- Serialized file ----

export interface SceneV1 {
  schemaVersion: typeof SCHEMA_VERSION
  app: { name: 'PoseLens'; version: string }
  canvas: { aspect: number; widthPx: number; heightPx: number }
  scene: { groundPlane: boolean; grid: boolean; horizon: boolean }
  body: BodyState
  pose: PoseState
  camera: CameraState & { aspect: number }
  sketch: SketchMeta
  balance: BalanceMeta
  variants: Variant[]
  export: ExportSettings
  tags: string[]
  notes: string
}
