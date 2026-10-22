// The Three.js scene is a projection of the store. These subscriptions are the only writers into it.
import type { AppStore } from '../state/store'
import type { Store } from '../state/types'
import { computeRig } from './bodyRig'
import type { Helpers } from './helpers'
import type { JointGizmo } from './jointGizmo'
import type { Mannequin } from './mannequin'

export interface SyncTargets {
  mannequin: Mannequin
  helpers: Helpers
  gizmo: JointGizmo
  /** Called when the shot camera or canvas ratio changes. */
  onShotCameraChange: (s: Store) => void
  onActiveCameraChange: (s: Store) => void
}

export function startSceneSync(store: AppStore, t: SyncTargets): () => void {
  const apply = (s: Store, prev: Store | null): void => {
    if (!prev || s.body.sliders !== prev.body.sliders) t.mannequin.applyRig(computeRig(s.body.sliders))
    if (!prev || s.pose !== prev.pose) t.mannequin.applyPose(s.pose)
    if (!prev || s.scene !== prev.scene) {
      t.helpers.ground.visible = s.scene.groundPlane
      t.helpers.grid.visible = s.scene.grid
    }
    if (!prev || s.camera !== prev.camera || s.scene.canvasRatio !== prev.scene.canvasRatio) t.onShotCameraChange(s)
    if (!prev || s.selectedJoint !== prev.selectedJoint) {
      t.mannequin.setSelected(s.selectedJoint)
      t.gizmo.attach(s.selectedJoint)
    }
    if (!prev || s.activeCamera !== prev.activeCamera) t.onActiveCameraChange(s)
  }
  apply(store.getState(), null)
  return store.subscribe((s, prev) => apply(s, prev))
}
