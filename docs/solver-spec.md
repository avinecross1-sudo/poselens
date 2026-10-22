# Solver Specification

## 1. Camera solve (from sketch)
Input: horizon line (two points), 1–3 vanishing points.
- Camera pitch & roll: derived from horizon line orientation and position relative to canvas center.
- Focal length: from spacing between VPs (if 2 orthogonal VPs) using f = sqrt(d1 * d2) where d1,d2 are distances from principal point to each VP. Fall back to a "suggested range" if only 1 VP is marked.
- Output: camera orientation + focal length range + confidence.
- Warn if VP spacing suggests extreme focal lengths (outside 8–300mm).

## 2. Root placement
Input: hip landmarks (L/R), foot landmarks, ground plane, camera.
- Project hip midpoint to ground, place root at average of hip Y and foot Y projected back.
- Snap feet to ground plane if within threshold.

## 3. Limb IK (2D landmark → 3D joint)
Algorithm: CCD (Cyclic Coordinate Descent), 8 iterations max.
- Chain: shoulder→upperArm→forearm→hand (and mirror for legs).
- End effector target: 2D landmark projected onto a plane at estimated depth.
- Depth estimate: from body-profile bone length + camera ray intersection with a sphere of that length around the parent joint.
- Respect joint limits. Fail gracefully with a yellow confidence if unreachable.

## 4. Depth resolve
- 1D search along camera ray from the projected 2D landmark, range [parent_joint - L, parent_joint + L] where L is the body-profile bone length.
- Pick depth minimizing distance to segment length + minimizing deviation from the occlusion hint (if provided).
- Mark confidence: green if residual < 2cm, yellow < 8cm, red otherwise.

## 5. Partial limb re-solve
- Scope: selected chain only.
- Preserve: locked joints, all non-selected chains, camera, root.
- Re-run steps 2–4 for the chain with the current camera.

### §1 as implemented (Phase 3A, `src/solve/cameraSolve.ts`)
- Cues live in image space and are mapped to frame space (origin = frame centre = principal point, +y up,
  unit = frame height) through the sketch alignment before solving.
- Roll: `roll = -(horizon angle)`; positive roll tilts world-up toward +x on screen, the sense of `CameraState.roll`.
- Pitch: the horizon sits `d = -f·tan(pitch)` from the frame centre along its up-normal, so
  `pitch = atan2(-d, f)` with `f = focalMm / sensorHeightMm` (frame heights). Pitch > 0 looks up.
- Focal: two orthogonal horizontal VPs satisfy `v1·v2 + f² = 0`, so `f² = -(v1·v2)`. The spec's
  `sqrt(d1·d2)` is the special case where the frame centre lies on the segment between the VPs and the
  horizon is level; the general form is used because it stays correct for a tilted or offset horizon.
  VPs are first snapped onto the placed horizon. The focal range comes from moving each VP 1% of the
  frame height along the horizon.
- With 0 or 1 horizontal VP the focal length cannot be solved: the current focal (clamped to 24–135 mm) is
  kept, 24–135 mm is reported as the suggested range, pitch is computed at that focal, and confidence is yellow.
- Warnings: VP off the horizon by more than 5% of the frame height (red beyond 15%); VPs on the same side of
  the frame centre (cannot be orthogonal); implied focal outside 8–300 mm (clamped, red); no placed horizon
  (taken from the VP line); and, with a third (vertical) VP, a vertical VP off the line through the frame
  centre square to the horizon, at the wrong distance for the solved pitch and focal, or implying a different
  focal than the horizontal pair.
- Yaw and camera position are not solved from cues: the solve keeps them and only tilts the view, sets the roll
  and sets the focal length.
