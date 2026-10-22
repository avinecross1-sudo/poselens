import type {
  BodySliders,
  BodyState,
  CameraState,
  ExportSettings,
  JointName,
  JointRotation,
  PoseState,
  RootTransform,
  SceneSettings,
} from '../types/scene'

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
  applyPreset: (presetId: string) => void
  setBodySlider: (key: keyof BodySliders, value: number, opts?: EditOpts) => void
}

export interface PoseSlice {
  pose: PoseState
  setJointRotation: (joint: JointName, rot: JointRotation, opts?: EditOpts) => void
  resetJoint: (joint: JointName) => void
  resetPose: () => void
  setRootTransform: (t: RootTransform, opts?: EditOpts) => void
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

export interface UiSlice {
  activeCamera: ActiveCamera
  selectedJoint: JointName | null
  setActiveCamera: (c: ActiveCamera) => void
  selectJoint: (j: JointName | null) => void
}

export type Store = HistorySlice & SceneSlice & BodySlice & PoseSlice & CameraSlice & ExportSlice & UiSlice
