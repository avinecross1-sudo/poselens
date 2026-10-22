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

/** Every body slider, in panel order. Ranges, groups and neutral values live in state/bodySliders.ts. */
export const BODY_SLIDER_KEYS = [
  // Proportions
  'height',
  'headScale',
  'torsoLength',
  'legLength',
  'armLength',
  'shoulderHipRatio',
  // Limbs
  'forearmRatio',
  'shinRatio',
  'handSize',
  'footSize',
  'limbThickness',
  // Shape / depth
  'mass',
  'muscle',
  'softness',
  'chestDepth',
  'waist',
  'hipDepth',
  // Advanced
  'neckLength',
  'neckThickness',
  'shoulderSlope',
  'jointSize',
] as const

export type BodySliderKey = (typeof BODY_SLIDER_KEYS)[number]
export type BodySliders = Record<BodySliderKey, number>

/** Per-side body differences. Thickness keys are multipliers (1 = none); height keys are meters at 1.75 m. */
export const ASYMMETRY_KEYS = [
  'leftArmThickness',
  'rightArmThickness',
  'leftLegThickness',
  'rightLegThickness',
  'leftShoulderHeight',
  'rightShoulderHeight',
  'leftHipHeight',
  'rightHipHeight',
] as const

export type AsymmetryKey = (typeof ASYMMETRY_KEYS)[number]

/**
 * Per-scene non-uniform scale applied above the root (the Phase 3 solve uses it to fit stylized art).
 * `matrix` is 4x4 column-major (THREE.Matrix4.elements). Applied only while `acknowledged` is true.
 */
export interface StylizedOverride {
  matrix: number[]
  acknowledged: boolean
}

export interface BodyState {
  presetId: string
  modifiedFrom: string | null
  sliders: BodySliders
  /** Slider keys, or `group:<groupId>`, that presets, blends and resets must not change. */
  locks: Record<string, boolean>
  asymmetry: Record<string, number>
  stylizedOverride: StylizedOverride | null
}

export interface RootTransform {
  position: Vec3
  rotation: Vec3
}

export const HAND_SHAPES = ['relaxed', 'open', 'fist', 'pointing', 'gripping'] as const
export type HandShape = (typeof HAND_SHAPES)[number]

export type Side = 'L' | 'R'

export interface PoseState {
  joints: Record<JointName, JointRotation>
  /** Finger shape per hand. Fingers are visual primitives under the hand node, not joints. */
  hands: Record<Side, HandShape>
  rootTransform: RootTransform
  /** Limb chains (IkChainId) whose joints are all locked. */
  ikLocks: string[]
  /** Individually locked joints (JointName). */
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

/**
 * Sketch underlay + perspective cues. Cue points (horizon, vps, landmarks) are in IMAGE space:
 * u,v in 0..1 across the image with the origin at its top-left; they may fall outside 0..1.
 * vps[0] and vps[1] are the two horizontal vanishing points, vps[2] the vertical one.
 */
/** Two horizontal VPs plus one vertical VP (docs/solver-spec.md §1). */
export const MAX_VPS = 3

export interface SketchMeta {
  hash: string | null
  path: string | null
  /** Pixel size of the imported image; null until a sketch is imported. */
  size: { width: number; height: number } | null
  alignment: { x: number; y: number; scale: number; rotation: number }
  landmarks: Record<string, Vec2>
  /** Per landmark: nearer ('toward') or farther ('away') from the viewer than its parent joint. */
  depthHints: Record<string, 'toward' | 'away'>
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
