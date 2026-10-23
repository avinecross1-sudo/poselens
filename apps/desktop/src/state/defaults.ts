import {
  JOINT_NAMES,
  type BodyState,
  type CameraState,
  type ExportSettings,
  type HandShape,
  type JointName,
  type JointRotation,
  type PoseState,
  type SceneMeta,
  type SceneSettings,
  type Side,
  type SketchMeta,
} from '../types/scene'
import { DEFAULT_SENSOR_HEIGHT_MM } from '../lib/units'
import { defaultPreset } from './presets'

/** Portrait 2:3 suits full-body character reference. */
export const DEFAULT_CANVAS_RATIO = 2 / 3
export const DEFAULT_EXPORT_WIDTH_PX = 2000
export const DEFAULT_FOCAL_MM = 50
/** Until camera presets exist (Phase 4) every saved camera is "custom". */
export const CUSTOM_CAMERA_PRESET = 'custom'

export const defaultScene = (): SceneSettings => ({
  canvasRatio: DEFAULT_CANVAS_RATIO,
  groundPlane: true,
  grid: true,
  horizon: true,
  groundShadow: false,
})

export const defaultBody = (): BodyState => {
  const p = defaultPreset()
  return { presetId: p.id, modifiedFrom: null, sliders: { ...p.sliders }, locks: {}, asymmetry: {}, stylizedOverride: null }
}

export const zeroRotation = (): JointRotation => ({ rx: 0, ry: 0, rz: 0 })

export const defaultJoints = (): Record<JointName, JointRotation> =>
  Object.fromEntries(JOINT_NAMES.map((j) => [j, zeroRotation()])) as Record<JointName, JointRotation>

export const DEFAULT_HAND_SHAPE: HandShape = 'relaxed'
export const defaultHands = (): Record<Side, HandShape> => ({ L: DEFAULT_HAND_SHAPE, R: DEFAULT_HAND_SHAPE })

export const defaultPose = (): PoseState => ({
  joints: defaultJoints(),
  hands: defaultHands(),
  rootTransform: { position: [0, 0, 0], rotation: [0, 0, 0] },
  ikLocks: [],
  jointLocks: [],
  depthNudges: {},
})

/** Full-body framing of a 1.75 m figure at 50 mm. */
export const defaultCamera = (): CameraState => ({
  position: [0, 1.3, 4.8],
  target: [0, 0.9, 0],
  up: [0, 1, 0],
  focal: DEFAULT_FOCAL_MM,
  sensorHeight: DEFAULT_SENSOR_HEIGHT_MM,
  roll: 0,
  preset: CUSTOM_CAMERA_PRESET,
})

/** Fixed-canvas framing starts at an A-series portrait page at 300 dpi-ish proportions. */
export const DEFAULT_FIXED_CANVAS_PX = { width: 2480, height: 3508 }
/** Bounds framing: 8% of the figure's larger side around it. */
export const DEFAULT_BOUNDS_MARGIN = 0.08
export const DEFAULT_NAMING_TEMPLATE = '{scene}'

export const defaultExport = (): ExportSettings => ({
  preset: 'clean',
  namingTemplate: DEFAULT_NAMING_TEMPLATE,
  settings: {
    widthPx: DEFAULT_EXPORT_WIDTH_PX,
    grid: false,
    shadow: false,
    framing: 'viewport',
    fixedWidthPx: DEFAULT_FIXED_CANVAS_PX.width,
    fixedHeightPx: DEFAULT_FIXED_CANVAS_PX.height,
    boundsMargin: DEFAULT_BOUNDS_MARGIN,
  },
})

export const defaultMeta = (): SceneMeta => ({ tags: [], notes: '' })

export const defaultSketch = (): SketchMeta => ({
  hash: null,
  path: null,
  size: null,
  alignment: { x: 0, y: 0, scale: 1, rotation: 0 },
  landmarks: {},
  depthHints: {},
  horizon: null,
  vps: [],
  solve: { settings: {}, confidence: {}, baked: false },
})
