// The Three.js scene is a projection of the store. These subscriptions are the only writers into it.
import { measure } from '../lib/measure'
import { lockedJoints } from '../lib/poseOps'
import { rigOf } from '../state/rigOf'
import type { AppStore } from '../state/store'
import type { Store } from '../state/types'
import { IK_CHAIN_IDS, type IkChainId } from '../solve/ik'
import type { Helpers } from './helpers'
import type { IkHandles } from './ikHandles'
import type { JointGizmo } from './jointGizmo'
import type { ConfidenceMap, Mannequin } from './mannequin'
import { LIMB_JOINTS, type LimbId } from '../solve/poseSolve'
import { JOINT_NAMES } from '../types/scene'
import type { Overlays } from './overlays'

export interface SyncTargets {
  mannequin: Mannequin
  helpers: Helpers
  gizmo: JointGizmo
  overlays: Overlays
  ikHandles: IkHandles
  /** Called when the shot camera or canvas ratio changes. */
  onShotCameraChange: (s: Store) => void
  onActiveCameraChange: (s: Store) => void
}

/** Heatmap colours from the last pose solve, or nulls when the overlay is off or nothing was solved. */
export function confidenceMaps(s: Store): [ConfidenceMap | null, ConfidenceMap | null] {
  if (!s.overlays.confidence) return [null, null]
  const conf = s.sketch.solve.confidence
  const joints: ConfidenceMap = {}
  for (const j of JOINT_NAMES) if (conf[j]) joints[j] = conf[j]
  const segments: ConfidenceMap = {}
  for (const [limb, members] of Object.entries(LIMB_JOINTS) as [LimbId, readonly (typeof JOINT_NAMES)[number][]][]) {
    const c = conf[limb]
    if (c) for (const j of members) segments[j] = c
  }
  return Object.keys(joints).length ? [joints, segments] : [null, null]
}

export function startSceneSync(store: AppStore, t: SyncTargets): () => void {
  const apply = (s: Store, prev: Store | null): void => {
    const bodyChanged = !prev || s.body.sliders !== prev.body.sliders || s.body.asymmetry !== prev.body.asymmetry
    if (bodyChanged) {
      const rig = rigOf(s.body)
      t.mannequin.applyRig(rig)
      t.overlays.setMeasurements(measure(rig))
      t.overlays.setHead(rig)
    }
    if (!prev || s.body.stylizedOverride !== prev.body.stylizedOverride) {
      const o = s.body.stylizedOverride
      t.mannequin.applyStylize(o && o.acknowledged ? o.matrix : null)
    }
    if (!prev || s.pose !== prev.pose) t.mannequin.applyPose(s.pose)
    if (!prev || s.scene !== prev.scene) {
      t.helpers.ground.visible = s.scene.groundPlane
      t.helpers.grid.visible = s.scene.grid
    }
    if (!prev || s.camera !== prev.camera || s.scene.canvasRatio !== prev.scene.canvasRatio) t.onShotCameraChange(s)

    const locksChanged = !prev || s.pose.jointLocks !== prev.pose.jointLocks || s.pose.ikLocks !== prev.pose.ikLocks
    if (locksChanged || s.selectedJoint !== prev?.selectedJoint) {
      const locked = lockedJoints(s.pose)
      t.mannequin.setLocked(locked)
      t.mannequin.setSelected(s.selectedJoint)
      // Locked joints stay selectable (to unlock them) but get no rotate gizmo.
      t.gizmo.attach(s.selectedJoint && !locked.has(s.selectedJoint) ? s.selectedJoint : null)
    }
    if (locksChanged || s.ikEnabled !== prev?.ikEnabled || s.overlays !== prev?.overlays) {
      const visible = Object.fromEntries(IK_CHAIN_IDS.map((c) => [c, s.overlays.ikHandles && s.ikEnabled[c]])) as Record<IkChainId, boolean>
      t.ikHandles.setState(visible, new Set(s.pose.ikLocks.filter((c): c is IkChainId => (IK_CHAIN_IDS as readonly string[]).includes(c))))
    }
    if (!prev || s.overlays !== prev.overlays) {
      t.overlays.headUnits.visible = s.overlays.headUnits
      t.overlays.gaze.visible = s.overlays.gaze
    }
    if (!prev || s.sketch.solve !== prev.sketch.solve || s.overlays !== prev.overlays) t.mannequin.setConfidence(...confidenceMaps(s))
    if (!prev || s.activeCamera !== prev.activeCamera) t.onActiveCameraChange(s)
  }
  apply(store.getState(), null)
  return store.subscribe((s, prev) => apply(s, prev))
}
