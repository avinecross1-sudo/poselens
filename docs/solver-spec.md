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

### §2–4 as implemented (Phase 3B, `src/solve/poseSolve.ts`, `depthResolve.ts`, `projection.ts`)
- Projection matches the shot camera render path (lookAt with up, then roll); frame space as in §1.
- **Depth of the figure.** Every drawn bone can only look shorter than it is, so a figure placed too far cannot
  reach its landmarks while a nearer one always can by tilting bones in depth. The whole staged solve is run over
  hip-centre depths 0.5–1.6× a body-size estimate (second-smallest of the per-bone estimates f·L/l); the cost is
  the mean landmark residual with the worst 1 in 8 landmarks dropped. When the best depth fits (≤ 5 mm) the
  farthest depth within 1 mm of it is taken (least foreshortening), refined by bisection; a hand drawing that never
  fits exactly takes the best depth itself (golden-section refinement).
- **Root placement (§2).** The hip centre sits on the ray through the hip midpoint at that depth; the left hip joint
  is depth-resolved at half the hip width from it (the right hip mirrors it). The two solutions are the figure
  turned left or right: a hip hint, then the toe directions on screen, then the pre-solve pose decide. Root heading
  = the hips' forward on the ground; the rest of the pelvis tilt goes in the hips joint.
- **Ground.** With "Feet on the ground" (default) the lowest body point is put on y = 0 and the figure is centred
  over the origin by moving figure *and camera* together, so the drawing still lines up and the camera height is
  solved from the figure. Feet within 6 cm of the lowest point are planted: the ankle goes where its ray meets the
  ground plane (exactly on its ray) and the toes likewise (§2 snap). Off (jumps, falls): the camera does not move.
- **Torso.** Neck base, waist and shoulders are depth-resolved from the hip centre / neck with rest distances,
  preferring the more upright and less twisted choice. The hips aim at the waist (or neck); spine and chest share
  the bend (the chest landmark sets the split); the clavicles turn within their limits toward the shoulders. The
  head axis comes from crown and chin; the gaze point sets the head turn by a 1D search, split between neck and head.
- **Limb IK (§3) + depth resolve (§4).** The elbow/knee is resolved from the shoulder/hip, the wrist/ankle from the
  elbow/knee; all (up to four) combinations are scored by residual + joint-limit clamping + distance to the pre-solve
  pose, and hints filter them. The §4 1D search is done in closed form (ray–sphere: two exact depths, or the
  closest point with residual = stretch). The limb is aimed analytically (upper joint along the bone, hinge plane
  through the end joint; nearly straight limbs keep their natural twist), clamped to joint limits, then CCD
  (8 iterations, limits enforced) polishes the end joint with the drawn mid joint held. Without a mid landmark the
  end target is the landmark on a plane at the base joint's depth, solved by CCD as §3 describes.
- **Confidence.** Per joint, the distance from the final joint (crown/chin on the head sphere) to its landmark ray:
  green < 2 cm, yellow < 8 cm, red otherwise; an unreachable IK target is at least yellow. A limb takes its worst
  joint. Joints whose two depth choices both fit with no hint are flagged ambiguous for review.
- Locked joints keep their rotations; hands and depth nudges are kept. The stylized override is not part of the
  solve (the panel says so when it is active).
