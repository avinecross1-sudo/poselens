import type { IkChainId } from '../solve/ik'
import type { FootPreset } from '../lib/poseOps'
import type {
  AsymmetryKey,
  BodySliderKey,

  BodyState,
  CameraState,
  ExportSettings,
  HandShape,
  JointName,
  JointRotation,
  PoseState,
  RootTransform,
  SceneSettings,
  Side,
  Vec3,
} from '../types/scene'
import type { BodyGroup } from './bodySliders'
import type { BodyPreset } from './presets'

/** The undoable document: everything history snapshots and metadata saves. */
export interface Doc {
  scene: SceneSettings
  body: BodyState
  pose: PoseState
  camera: CameraState
}
export type DocKey = keyof Doc

/** preview = live drag update, coalesced into one undo step on endGesture(). */
export interface EditOpts {
  preview?: boolean
}

export interface Command {
  label: string
  before: Doc
  after: Doc
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
  setSceneFlag: (key: 'groundPlane' | 'grid' | 'horizon', value: boolean) => void
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
}

export type ActiveCamera = 'editor' | 'shot'

export interface Overlays {
  headUnits: boolean
  gaze: boolean
  ikHandles: boolean
}

export interface UiSlice {
  activeCamera: ActiveCamera
  selectedJoint: JointName | null
  /** Chains that show an IK drag handle. */
  ikEnabled: Record<IkChainId, boolean>
  overlays: Overlays
  /** Warnings from the last retarget, IK solve or pose apply. Not saved. */
  poseWarnings: string[]
  setActiveCamera: (c: ActiveCamera) => void
  selectJoint: (j: JointName | null) => void
  setIkEnabled: (chain: IkChainId, on: boolean) => void
  setOverlay: (key: keyof Overlays, on: boolean) => void
  setPoseWarnings: (w: string[]) => void
}

/** User data that lives outside scenes (persisted by main in the app's userData folder). */
export interface LibrarySlice {
  customPresets: BodyPreset[]
  favoritePoses: string[]
  /** False until the saved library has been read; persistence waits for it. */
  libraryLoaded: boolean
  /** Saves the current body as "Modified from [X]"; returns the new preset id. */
  saveCustomPreset: (modifiedFromId: string) => string
  deleteCustomPreset: (id: string) => void
  toggleFavoritePose: (id: string) => void
  setLibrary: (lib: { customPresets: BodyPreset[]; favoritePoses: string[] }) => void
}

export type Store = HistorySlice & SceneSlice & BodySlice & PoseSlice & CameraSlice & ExportSlice & UiSlice & LibrarySlice

