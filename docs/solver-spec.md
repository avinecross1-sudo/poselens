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
