import type { IkChainId } from '../solve/ik'
import type { FootPreset } from '../lib/poseOps'
import type {
  AsymmetryKey,
  BodySliderKey,

  BodyState,
  CameraState,
  ClipboardState,
  ExportFraming,
  ExportOptions,
  ExportPreset,
  ExportSettings,
  HandShape,
  JointName,
  JointRotation,
  PoseState,
  RootTransform,
  SceneMeta,
  SceneSettings,
  Side,
  SketchMeta,
  Variant,
  Vec2,
  Vec3,
} from '../types/scene'
import type { BalanceResult } from '../lib/balance'
import type { SolveResult } from '../solve/cameraSolve'
import type { DepthHint, LandmarkId } from '../solve/landmarks'
import type { NudgeJoint } from '../solve/depthNudge'
import type { PoseSolveResult, SolvePart } from '../solve/poseSolve'
import type { BodyGroup } from './bodySliders'
import type { BodyPreset } from './presets'

/** The undoable document: everything history snapshots and metadata saves. */
export interface Doc {
  scene: SceneSettings
  body: BodyState
  pose: PoseState
  camera: CameraState
  sketch: SketchMeta
  /** Named camera + pose snapshots (2–4). */
  variants: Variant[]
  /** Scene tags and notes. */
  meta: SceneMeta
}
export type DocKey = keyof Doc

/** preview = live drag update, coalesced into one undo step on endGesture(). */
export interface EditOpts {
  preview?: boolean
  /** The step is a solve (camera, pose or partial re-solve); bakeSolve removes it from the history. */
  solve?: boolean
}

export interface Command {
  label: string
  before: Doc
  after: Doc
  solve?: boolean
}

export interface HistoryState {
  past: Command[]
  future: Command[]
  gesture: { label: string; before: Doc } | null
}

export interface HistorySlice {
  history: HistoryState
  edit: (label: string, recipe: (s: Store) => Partial<Doc>, opts?: EditOpts) => void
  endGesture: () => void
  undo: () => void
  redo: () => void
  /** Replaces the whole document (load). Clears history. */
  replaceDoc: (doc: Doc) => void
}

export interface SceneSlice {
  scene: SceneSettings
  setCanvasRatio: (ratio: number) => void
  setSceneFlag: (key: 'groundPlane' | 'grid' | 'horizon' | 'groundShadow', value: boolean) => void
  meta: SceneMeta
  /** Adds a tag (trimmed, case-insensitively unique). */
  addSceneTag: (tag: string) => void
  removeSceneTag: (tag: string) => void
  setSceneNotes: (notes: string, opts?: EditOpts) => void
}

export interface BodySlice {
  body: BodyState
  /** Seed or custom preset. Locked sliders keep their values. */
  applyPreset: (presetId: string) => void
  setBodySlider: (key: BodySliderKey, value: number, opts?: EditOpts) => void
  /** Preset A -> B at t (0..1); preview during a drag. Body is marked as modified from A. */
  blendPresets: (aId: string, bId: string, t: number, opts?: EditOpts) => void
  /** Lock key is a slider key or groupLockKey(group). */
  toggleBodyLock: (lockKey: string) => void
  /** Back to the current preset's values (neutral for custom bodies), skipping locked sliders. */
  resetBodyGroup: (group: BodyGroup) => void
  resetBody: () => void
  /** With `symmetric`, the mirrored control on the other side gets the same value. */
  setAsymmetry: (key: AsymmetryKey, value: number, symmetric: boolean, opts?: EditOpts) => void
  resetAsymmetry: () => void
  /** Diagonal scale (x, y, z); null removes the override. */
  setStylizedScale: (scale: Vec3 | null, opts?: EditOpts) => void
  acknowledgeStylized: (acknowledged: boolean) => void
}

export interface PoseSlice {
  pose: PoseState
  /** Ignored for locked joints. */
  setJointRotation: (joint: JointName, rot: JointRotation, opts?: EditOpts) => void
  resetJoint: (joint: JointName) => void
  /** Resets unlocked joints; locks are kept. */
  resetPose: () => void
  setRootTransform: (t: RootTransform, opts?: EditOpts) => void
  toggleJointLock: (joint: JointName) => void
  toggleChainLock: (chain: IkChainId) => void
  /** Drags the chain's wrist/ankle toward a world-space target with CCD IK. */
  solveIkTarget: (chain: IkChainId, target: Vec3, opts?: EditOpts) => void
  /** Library pose retargeted onto the current body and grounded. Locked joints keep their values. */
  applyLibraryPose: (id: string) => void
  mirrorPose: () => void
  /** Blends `from` toward `to` at t; preview during a drag. */
  blendPose: (from: PoseState, to: PoseState, t: number, opts?: EditOpts) => void
  setHandShape: (side: Side, shape: HandShape) => void
  applyFootPreset: (side: Side, preset: FootPreset) => void
  /** Toe direction in radians, positive = toes turned out. */
  setToeDirection: (side: Side, outward: number, opts?: EditOpts) => void
}

export interface CameraSlice {
  camera: CameraState
  setCameraHeight: (v: number, opts?: EditOpts) => void
  setCameraTargetHeight: (v: number, opts?: EditOpts) => void
  setCameraYaw: (v: number, opts?: EditOpts) => void
  setCameraPitch: (v: number, opts?: EditOpts) => void
  setCameraDistance: (v: number, opts?: EditOpts) => void
  setCameraRoll: (v: number, opts?: EditOpts) => void
  setCameraFocal: (v: number, opts?: EditOpts) => void
  setCameraSensorHeight: (v: number, opts?: EditOpts) => void
  resetCamera: () => void
}

export interface ExportSlice {
  exportSettings: ExportSettings
  sceneName: string
  setExportWidth: (px: number) => void
  setSceneName: (name: string) => void
  setExportPreset: (preset: ExportPreset) => void
  setExportFraming: (framing: ExportFraming) => void
  /** Grid / shadow switches, fixed canvas size and bounds margin (sizes are clamped). */
  setExportOptions: (opts: Partial<Omit<ExportOptions, 'widthPx' | 'framing'>>) => void
  setNamingTemplate: (template: string) => void
}

/** Named camera + pose snapshots. The list lives in the document (undoable, saved); at most MAX_VARIANTS. */
export interface VariantsSlice {
  variants: Variant[]
  /** Variant last saved or applied, for {variant} in the naming template. Not saved. */
  activeVariantId: string | null
  /** Snapshots the current camera and pose. Returns the new id, or null when the list is full. */
  addVariant: (name?: string) => string | null
  /** Overwrites a variant with the current camera and pose. */
  updateVariant: (id: string) => void
  /** Restores the variant's camera and pose exactly as saved (camera skipped under trace lock). */
  applyVariant: (id: string) => void
  renameVariant: (id: string, name: string) => void
  deleteVariant: (id: string) => void
  /** Copy of a variant under "<name> copy". Null when the list is full. */
  duplicateVariant: (id: string) => string | null
  /** Starts a new, unsaved scene from this one: same document under "<name> copy", fresh undo history. */
  duplicateScene: () => void
}

export interface ClipboardSlice {
  /** Survives loading another scene; not saved. */
  clipboard: ClipboardState
  copyCamera: () => void
  copyBody: () => void
  copyPose: () => void
  /** False while trace lock freezes the camera or when nothing is copied. */
  pasteCamera: () => boolean
  /** Pastes the body profile (unlocked sliders, asymmetry, override) and retargets the current pose onto it. */
  pasteBody: () => boolean
  /** Pastes the pose, retargeted from the body it was copied from onto this one. Locked joints keep their values. */
  pastePose: () => boolean
}

/** Ground contact, support polygon and CoM for the current body + pose (docs/balance-spec.md). Derived, not saved. */
export interface BalanceSlice {
  balance: BalanceResult | null
  setBalance: (b: BalanceResult | null) => void
}

export type ActiveCamera = 'editor' | 'shot'

export interface Overlays {
  headUnits: boolean
  gaze: boolean
  ikHandles: boolean
  /** Pose-solve confidence colours on the mannequin. */
  confidence: boolean
  /** CoM, plumb line, support polygon, contacts and lean arrow. */
  balance: boolean
  /** Background shapes enclosed by the figure, tinted. */
  negativeSpace: boolean
  /** Parts of the figure hidden behind other parts, shown through them. */
  occlusion: boolean
  /** Lens stretch rings in the shot view when the focal length is wide (< 24 mm). */
  lensGuide: boolean
}

export type FigureStyle = 'mannequin' | 'anatomy'

/** Viewport readability looks. normal = the figure as drawn; the others replace its materials. */
export const VIEW_LOOKS = ['normal', 'silhouette', 'values', 'depth'] as const
export type ViewLook = (typeof VIEW_LOOKS)[number]

export interface UiSlice {
  activeCamera: ActiveCamera
  selectedJoint: JointName | null
  /** Chains that show an IK drag handle. */
  ikEnabled: Record<IkChainId, boolean>
  overlays: Overlays
  /** Warnings from the last retarget, IK solve or pose apply. Not saved. */
  poseWarnings: string[]
  /** Loaded sketch images by hash; the layer shows the one the document's sketch names. */
  sketchImages: Record<string, SketchImage>
  sketchView: SketchView
  cueTool: CueTool
  /** First horizon point while the second is still to be placed (image space). */
  cueDraft: Vec2 | null
  /** Last solve failure or sketch load warning. Not saved. */
  sketchMessage: string | null
  /** Landmark the landmark tool places next. */
  activeLandmark: LandmarkId | null
  /** Pose solve option: stand the figure on the ground (camera height follows). */
  feetOnGround: boolean
  /** How the figure is drawn: grey mannequin or colour-coded muscle forms. Applies to the viewport and PNG export. */
  figureStyle: FigureStyle
  setFigureStyle: (s: FigureStyle) => void
  /** Readability look in the viewport. Not saved; export uses its own preset. */
  viewLook: ViewLook
  setViewLook: (l: ViewLook) => void
  /** Depth-nudge ghost: the limb as it would be (hovering a handle) or as it was (while dragging). Not saved. */
  nudgeGhost: NudgeGhost | null
  setActiveCamera: (c: ActiveCamera) => void
  selectJoint: (j: JointName | null) => void
  setIkEnabled: (chain: IkChainId, on: boolean) => void
  setOverlay: (key: keyof Overlays, on: boolean) => void
  setPoseWarnings: (w: string[]) => void
  cacheSketchImage: (image: SketchImage) => void
  setSketchView: (v: Partial<SketchView>) => void
  setCueTool: (t: CueTool) => void
  setCueDraft: (p: Vec2 | null) => void
  setSketchMessage: (m: string | null) => void
  /** Arms the landmark tool on a landmark (null disarms it). */
  setActiveLandmark: (id: LandmarkId | null) => void
  setFeetOnGround: (on: boolean) => void
  setNudgeGhost: (g: NudgeGhost | null) => void
}

export interface NudgeGhost {
  pose: PoseState
  /** The limb drawn as a ghost. */
  joints: JointName[]
}

/** User data that lives outside scenes (persisted by main in the app's userData folder). */
export interface LibrarySlice {
  customPresets: BodyPreset[]
  favoritePoses: string[]
  /** Tags and notes per body preset id (seed or custom). */
  presetMeta: Record<string, SceneMeta>
  /** False until the saved library has been read; persistence waits for it. */
  libraryLoaded: boolean
  /** Saves the current body as "Modified from [X]"; returns the new preset id. */
  saveCustomPreset: (modifiedFromId: string) => string
  deleteCustomPreset: (id: string) => void
  toggleFavoritePose: (id: string) => void
  setPresetTags: (id: string, tags: string[]) => void
  setPresetNotes: (id: string, notes: string) => void
  setLibrary: (lib: { customPresets: BodyPreset[]; favoritePoses: string[]; presetMeta?: Record<string, SceneMeta> }) => void
}

export interface SketchImage {
  hash: string
  name: string
  /** Object URL for the <img> underlay. */
  url: string
  width: number
  height: number
}

/** Cue tool currently armed in the viewport. 'move' drags the sketch itself. */
export type CueTool = 'none' | 'horizon' | 'vp' | 'move' | 'landmark'

/** View-only sketch layer settings. Not saved in scenes. */
export interface SketchView {
  visible: boolean
  opacity: number
  /** Locks the sketch's scale / rotation / position. Cues stay editable. */
  locked: boolean
  showCues: boolean
  /** Compare mode: the sketch is drawn over the mannequin instead of under it. */
  compare: boolean
  /** In compare mode the lines are tinted and difference-blended, so where drawing and mannequin disagree stands out. */
  difference: boolean
  /** Freezes the shot camera and the sketch placement so the drawing stays lined up while posing. */
  traceLock: boolean
}

export interface SketchSlice {
  sketch: SketchMeta
  /** Records an imported image: sets hash, path and size and clears the previous cues. */
  importSketch: (image: SketchImage, path: string | null) => void
  removeSketch: () => void
  /** Ignored while the sketch is locked. */
  setSketchAlignment: (a: Partial<SketchMeta['alignment']>, opts?: EditOpts) => void
  resetSketchAlignment: () => void
  /** Image-space points. */
  setHorizon: (h: [Vec2, Vec2] | null, opts?: EditOpts) => void
  setHorizonPoint: (index: 0 | 1, p: Vec2, opts?: EditOpts) => void
  addVp: (p: Vec2) => void
  moveVp: (index: number, p: Vec2, opts?: EditOpts) => void
  removeVp: (index: number) => void
  clearCues: () => void
  /** One undo step that sets pitch, roll and focal and records the solve; the camera stays editable. */
  solveCameraFromSketch: () => SolveResult
  /** Image-space point. Placing one makes an earlier pose solve stale. */
  setLandmark: (id: LandmarkId, p: Vec2, opts?: EditOpts) => void
  removeLandmark: (id: LandmarkId) => void
  clearLandmarks: () => void
  setDepthHint: (id: LandmarkId, hint: DepthHint | null) => void
  /**
   * Staged pose solve from the landmarks (solver-spec §2–4), plus the camera from the cues when they have not
   * been solved yet. One undo step covers pose, camera and the solve record; the pose stays fully editable.
   */
  solvePoseFromSketch: () => PoseSolveResult
  /**
   * Partial re-solve (solver-spec §5): only the part's joints change; root, camera, locked joints and every other
   * limb are kept. One undo step. Needs a previous pose solve.
   */
  resolvePart: (part: SolvePart) => PoseSolveResult
  /**
   * Pushes a joint nearer the viewer (delta < 0) or farther (delta > 0) by delta meters of view depth, keeping bone
   * lengths; records it in pose.depthNudges and re-scores the solve confidence. Returns the depth change made (m).
   */
  nudgeJointDepth: (joint: NudgeJoint, delta: number, opts?: EditOpts) => number
  /** Takes a joint's accumulated nudge back out and removes it from pose.depthNudges. */
  clearDepthNudge: (joint: NudgeJoint) => void
  /**
   * Bakes the solve into a manual pose: pose and camera stay, the solve record is cleared (baked: true), nudges are
   * dropped and the solve steps leave the undo history. Not undoable. Returns false when there was nothing to bake.
   */
  bakeSolve: () => boolean
}

export type Store = HistorySlice &
  SketchSlice &
  SceneSlice &
  BodySlice &
  PoseSlice &
  CameraSlice &
  ExportSlice &
  UiSlice &
  LibrarySlice &
  VariantsSlice &
  ClipboardSlice &
  BalanceSlice

