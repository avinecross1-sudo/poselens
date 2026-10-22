# PoseLens progress log

## 2026-10-22 — Session 0: doc cleanup and kickoff (no code)

### What was done
- Read CLAUDE.md, docs/, prompts/ and seeds/. Confirmed nothing is built yet (no apps/ folder).
- Cleaned formatting in CLAUDE.md, docs/*.md and prompts/*.md: removed paste escapes
  (`\#`, `\-`, `\[`, `&#x20;` and similar) and doubled line spacing; closed the unclosed JSON
  fence in metadata-schema.md; removed an unclosed fence at the top of prompts/00-kickoff.md;
  fenced the repo layout and mannequin hierarchy in CLAUDE.md. Wording unchanged.
- Added to docs/balance-spec.md: default segment mass ratios (Dempster/Winter adult table)
  and the preset adjustment rule (torso boost above mass 0.5, head mass scales with headScale^3).
- Added to CLAUDE.md: "Head-unit & measurement overlay (Phase 2)" section.
- Kickoff (prompts/00-kickoff.md) delivered and approved: architecture summary, IPC contract,
  Phase 1 file list, 14 ambiguities with resolutions. Doc:
  https://claude.ai/artifact/1gSbcpvdTFwFBsA5VUigWQ

### Decisions approved at kickoff (Phase 1 follows these)
1. Electron + Vite glue: electron-vite (one config for main, preload, renderer; HMR).
2. Run `git init` and add an npm workspaces root package.json before Phase 1 code.
3. Camera state stores position, target, up, roll, focal, sensorHeight. Height, target height,
   yaw and pitch are derived controls converted in src/lib/cameraMath.ts.
4. scene.canvasRatio is the single source of aspect; camera.aspect and canvas.aspect are
   written from it on save; canvas.aspect wins on load.
5. Horizon helper = vanishing line of the ground plane at camera eye height (moves with pitch).
6. pose.joints is keyed by hierarchy node name (e.g. thighL, not hipL). Schema example in
   docs/metadata-schema.md to be updated to match in Phase 1.
7. Joint Euler order fixed at XYZ as a named constant.
8. Overall sliders: height scales bone lengths by height / 1.75; mass and softness widen capsule
   radius; muscle widens limbs and chest; shoulderHipRatio sets shoulder vs hip width. All named consts.
9. seeds/ imported at build time through a Vite alias, read-only.
10. Export: folder dialog picks a parent; writes {SceneName}/export.png + export.json;
    width defaults to 2000 px, height from aspect. Naming template deferred to Phase 4.
11. Save writes scene.json (no PNG); Load accepts scene.json or export.json.
12. Metadata sections for later phases (sketch, balance, variants) written as empty defaults.
13. Undo: one command per gesture, committed on pointer release; history never saved.
14. camera.preset written as "custom" until camera presets exist.
- IPC channels: scene:save, scene:load, export:write, app:info (invoke/handle only).
- Round-trip "exactly" = save → load → save deep-equals the first save; editor camera excluded.

### Assumptions
- Mass ratios and head-unit reference values are standard human proportions chosen by Claude,
  not supplied by the user; tune if they feel wrong in practice.
- The repo folder is not yet under version control.

### Stubbed or deferred
- seeds/pose-library.json has names and tags only, no joint rotations. Needed for Phase 2.
- No test sketch in apps/desktop/test/fixtures/ yet. Needed for Phases 3A and 3B.
- electron-builder config and Playwright smoke tests deferred to Phase 4.
- sketch, balance, variants and clipboard: TypeScript types only in Phase 1, no slices.

## 2026-10-22 — Phase 1: Core Studio

**Status: complete.** Accepted by Tram on 2026-10-22 (export confirmed in Electron).

### What was built
- Repo: `git init`, npm workspaces root (`/package.json`), app in `apps/desktop` on electron-vite 6
  (Vite 8), Electron 45, React 18, TS 5.9 strict, Three 0.186, Zustand 5, Tailwind 3, vitest 5.
  `npm run dev` / `build` / `test` / `typecheck` all run from the repo root.
- Electron: `electron/main.ts` (window, context isolation on, sandboxed preload, no Node in renderer),
  `electron/ipc.ts` (`scene:save`, `scene:load`, `export:write`, `app:info`), `electron/fileIO.ts`
  (dialogs + fs). `electron/preload.ts` exposes typed `window.poselens` (`src/types/ipc.ts`).
- State (`src/state`): one store from slices scene, body, pose, camera, export, history, plus a small
  ui slice (active camera, selected joint). History snapshots the document (scene/body/pose/camera);
  drags use `{ preview: true }` and collapse into one undo step on release. Load clears history.
- Viewport (`src/three`): primitive mannequin with the CLAUDE.md hierarchy (`mannequin.ts`),
  slider -> bone offset/radius mapping (`bodyRig.ts`, pure, named consts), EDITOR camera with
  OrbitControls and state-only SHOT camera (`cameraRig.ts`), ground/grid/horizon (`helpers.ts`),
  click-to-select + rotate gizmo (`jointGizmo.ts`, TransformControls, FK only), store subscriptions
  (`sceneSync.ts`). Shot view letterboxes to the canvas ratio; editor view shows the shot frustum.
- Panels: left = presets + Overall sliders + selected-joint rotation sliders; right = shot camera
  (height, target height, distance, yaw, pitch, roll, focal 8-300 mm, sensor height, aspect presets,
  helper toggles) + export; bottom = undo/redo (with labels), save, load. Shortcuts: Ctrl+Z,
  Ctrl+Shift+Z / Ctrl+Y, Ctrl+S, Ctrl+O, C toggles camera, Esc deselects.
- Export: offscreen WebGL render through the shot camera with transparent clear, helpers and gizmo
  hidden (`src/export/renderPng.ts`); main writes `{parent}/{SceneName}/export.png` + `export.json`.
  Save writes `scene.json`; Load accepts scene.json or export.json (`src/export/metadata.ts`).
- Tests (34, green): units, cameraMath round-trips, bodyRig (sliders change offsets/radii, every seed
  preset valid, feet on ground), history (drag coalescing, cross-slice undo/redo, cap), metadata
  round-trip (save -> load -> save deep-equals; load restores every slice; defaults; version reject).
- Checked by hand in the dev renderer: mannequin visible, camera toggle, body sliders and presets
  change the mannequin, gizmo drag rotates a joint as one undo step, focal change reframes, exported
  PNG is 2000x3000 with transparent background and no helpers, save/load restores the scene.
- docs/metadata-schema.md: joint key example now `thighL`; added the `scene` toggles block and notes.

### Assumptions
- Shot camera "distance" control added (horizontal camera-to-target distance); height, target height
  and pitch are coupled views of position/target. Pitch tilts in place (moves target height);
  distance keeps both heights. Pitch is clamped to ±85°.
- Default canvas ratio is 2:3 portrait; default camera frames a 1.75 m figure at 50 mm from 4.8 m.
- Rest skeleton proportions (1.75 m, faces +Z, character's left = +X, feet on y = 0) and slider gains
  (mass 0.9, softness 0.35, muscle 0.5 per unit, girth floor 0.6; shoulder:hip split evenly as
  sqrt of ratio vs 1.15) are Claude's choices, tunable in `bodyRig.ts`.
- `hips` is posable and carries the whole body; root transform exists in state but has no UI yet.
- Added a top-level `scene` block (ground/grid/horizon) to the file so round-trip is exact.
- Scene name is UI state (from the export panel, or the folder/file name on load), not saved in JSON.
- npm 12 did not run Electron's postinstall, so the root `postinstall` runs `electron/install.js`.

### Stubbed or deferred
- Export naming template, export presets, and camera presets (Phase 4). `camera.preset` = "custom".
- sketch, balance, variants, clipboard: types only, written as empty defaults.
- Body asymmetry, locks, stylized override: carried in state/file, no UI or effect yet (Phase 2).
- Head-unit overlay (Phase 2). No IK, joint locks, or joint limits.
- electron-builder config and Playwright smoke tests (Phase 4).
- Export was verified in the renderer with a stubbed IPC bridge; Tram then confirmed a real export
  through the Electron folder dialog works.
- Renderer bundle is ~1.6 MB unsplit (Three.js); fine for desktop, not optimised.

## 2026-10-22 — Phase 2: Body & Pose Depth

**Status: complete.** Accepted by Tram on 2026-10-22 (runs in Electron). Build green, 86 vitest tests passing (34 before).

### What was built
1. **Slider taxonomy** (`src/state/bodySliders.ts`, `src/three/bodyRig.ts`): 21 sliders in four groups.
   Proportions: height, head size, torso, legs, arms, shoulder:hip. Limbs: forearm:upper-arm and shin:thigh
   split, hand size, foot size, limb thickness. Shape / Depth: mass, muscle, softness, chest depth, waist,
   hip depth. Advanced: neck length, neck thickness, shoulder height, joint marker size. Proportion sliders
   change segments relative to each other and the figure is rescaled so standing height always equals the
   height slider. Per-slider and per-group locks, reset group, reset all. Seed presets gained the extra
   sliders where they differ from neutral (Child, Chibi, Heroic and others) in `seeds/body-presets.json`.
2. **Preset blend** A→B with live preview (one undo step per drag); "Save as custom preset" adds
   "Modified from [A]" (numbered if taken) to the preset list. Custom presets persist in a user library.
3. **Asymmetry**: L/R arm and leg thickness, L/R shoulder height, L/R hip height; symmetry toggle edits
   both sides together. Only non-neutral values are saved.
4. **Stylized override**: X/Y/Z scale matrix stored with an `acknowledged` flag; applied (above the root)
   only once acknowledged; amber banner in the viewport while active, and a prompt for unacknowledged
   overrides loaded from a file.
5. **Locks**: per-joint locks and limb-chain locks (`ikLocks`). Locked joints keep their values through
   rotate, reset, library apply, mirror, blend, foot presets, IK and body changes; locked joints show red
   and get no gizmo.
6. **IK** (`src/solve/ik.ts`, `src/three/ikHandles.ts`): cyan drag handles on wrists and ankles, per-chain
   on/off. CCD per solver-spec (8 iterations max) with joint limits from `src/solve/jointLimits.ts`
   clamped after every step. Each iteration first sets the elbow/knee bend by the law of cosines, because
   plain CCD stalls on a straight hinge. Unreachable targets show "target out of reach".
7. **Pose library** (`src/state/poseLibrary.ts`): 12 seed poses, search, tag filter, favorites (persisted).
   Poses are grounded on apply (jump is lifted 0.35 m).
8. **Mirror** and **pose blend** (A = current or library pose, B = library pose, slider).
9. **Retargeting** (`src/solve/retarget.ts`): every body change keeps joint rotations, takes bone lengths
   from the new body, and keeps a grounded pose on the ground. Warnings for joints outside limits, a
   planted foot lifting off, or the body sinking into the floor. "Load onto current body" loads a scene's
   pose and camera and retargets it onto the current body.
10. **Hands and feet**: hand shapes relaxed / open / fist / pointing / gripping (finger primitives under
    the hand node; `pose.hands` in metadata), foot presets flat / tiptoe / heel / pointed, toe direction.
11. **Head-unit overlay** (`src/lib/measure.ts`, `src/three/overlays.ts`, `ViewportHud.tsx`): ruler with a
    tick per head unit and "N heads · H m" label; readout of head unit, shoulder and hip width, and the
    selected limb's bone lengths. Viewport-only, hidden in PNG export.
12. **Gaze**: arrow and dashed sight line from the eyes along the head's forward axis. Viewport-only.
- New IPC channels `library:load` / `library:save` write `library.json` in the app's userData folder.
- Left panel is now Body / Pose tabs; picking a joint switches to Pose.

### Acceptance checks
- Athletic→Heavy blend: every slider and every segment size moves monotonically between the two
  presets, all positive, height stays exact (`test/body.test.ts`).
- IK never violates joint limits: 200 random targets across all four chains (`test/ik.test.ts`), and a
  store-level IK drag.
- Retarget: a library pose on every seed preset keeps rotations and stays grounded; airborne poses keep
  their root; foot-lift and limit warnings fire (`test/pose.test.ts`). Loading onto a different body is
  covered in `test/metadata.roundtrip.test.ts`.
- Pose blend: endpoints exact, halfway is the per-joint midpoint, and every pair of library poses blends
  inside joint limits.
- Metadata round-trip still deep-equal with all Phase 2 fields; Phase 1 files load with neutral extras.
- Checked by hand in the dev renderer: presets incl. Chibi (3.0 heads), head-unit ruler (Average 7.6
  heads), gaze line, library poses (walk, run, crouch, jump, punch, kick, sit, lie, reach), IK drag on a
  leg as one undo step, stylized override banner before and after acknowledging.

### Assumptions
- **Pose library joint data was authored by Claude** (degrees in `seeds/pose-library.json`, now
  version 2). They are approximations meant to be tuned.
- **Head-unit section restored to CLAUDE.md.** Session 0 logged adding it, but it was not in the file;
  restored from the coordinator's description of the original.
- Head sphere changed from r 0.105 to r 0.115 (crown height unchanged) so Realistic Average reads ~7.6
  heads instead of 8.3.
- Joint limits are approximate human ranges; the rotate gizmo and joint sliders may still go past them
  (only IK is clamped), and the joint panel shows each axis's limit.
- Pose blend moves limited joints per Euler channel (stays inside limits, bends the anatomical way);
  free joints (hips) and the root use shortest-arc slerp. Hand shapes switch at the halfway point.
- Hip-height asymmetry is capped at ±3 cm; beyond 2 cm one foot lifts and the warning appears.
- Overlay toggles and the symmetry toggle are UI state, not saved in scenes.
- Custom presets and favorites live in the user library, not in scene files; a scene whose custom preset
  is missing still loads its exact slider values.

### Stubbed or deferred
- No root-transform UI yet (root moves only through grounding).
- Ground-contact warnings are a Phase 2 retarget aid only; full balance (CoM, support polygon) is Phase 4.
- `.claude/launch.json` and `.claude/vite.renderer.mjs` are local preview helpers (renderer without
  Electron) and are not committed.

## 2026-10-22 — Phase 3A: Sketch Import & Perspective Cues

**Status: complete, awaiting acceptance in Electron.** Build green, 124 vitest tests passing (86 before). Checked in the
renderer-only preview; the native file dialog (main process) has not been exercised, so Tram should try Import in `npm run dev`.

### What was built
1. **Sketch import** (`electron/fileIO.ts`, `electron/ipc.ts`, `src/export/sketchFile.ts`): new IPC `sketch:import` (PNG/JPG
   picker; main reads the file and returns bytes + `sha256`) and `sketch:read` (re-read by path, PNG/JPG only, 64 MB cap).
   The renderer decodes it into an object URL. Hash, path and pixel size go into metadata.
2. **Underlay layer** (`src/three/SketchLayer.tsx`): the WebGL canvas is now transparent; the letterbox, frame colour and sketch
   sit behind it. Opacity, show/hide, lock, scale, rotate, pan (sliders, plus a Move tool that drags it in the viewport). Shown in
   both cameras; in the shot view it is cropped to the frame. View-only, never in the PNG export.
3. **Cue tools** (`src/three/CueOverlay.tsx`): two-click horizon, 1–3 vanishing points, all draggable, with edge markers when a VP is
   off-screen (shrink the sketch to reach far VPs). Esc disarms a tool.
4. **Camera solve** (`src/solve/cameraSolve.ts`, `solver-spec.md` §1 "as implemented"): roll from the horizon, pitch from the
   horizon offset, focal from two orthogonal VPs, a suggested range (24–135 mm) with one VP or none, confidence
   green/yellow/red, and warnings for VPs off the horizon, VPs that cannot be orthogonal, extreme focal (outside 8–300 mm,
   clamped), a missing horizon, and a vertical VP (third) that disagrees.
5. **Panels** (`SketchPanel.tsx`, `PerspectivePanel.tsx`): new **Sketch** tab in the left panel with a Sketch section and, next to
   it, Perspective cues (tools, cue list, Solve camera, last-solve readout with warnings).
6. **State**: `sketch` slice (cues + alignment + solve record) is part of the undoable document (`Doc.sketch`); image cache, view
   settings, active tool and messages live in the UI slice. Solving is one undo step covering camera and solve record.
7. Metadata: `sketch` is now written and read (`size` added; see metadata-schema.md "Phase 3A"). Older files load with defaults.
   On scene load the sketch image is re-read from its path; a missing or changed file is reported and the cues are kept.

### Acceptance checks
- Fixture solve: `test/fixtures/synthetic-2pt.json` cues recover the drawing camera (pitch −10°, roll 4°, 28 mm) to better than
  1e-4° / 1e-3 mm (`test/cameraSolve.test.ts`); ±1% hand-placement error stays within 2° roll, 3° pitch, 25% focal.
- **Visual match:** the solved camera is applied through the real `applyShotCamera` and Three.js projection: the two box
  directions land on the placed VPs and every horizontal direction lies on the placed horizon (tests), and in the live preview the
  projected VPs and the on-screen markers agreed to within 0.001 px.
- Undo restores the pre-solve camera exactly (deep-equal, plus the whole document); redo re-applies it. The solved camera stays
  fully editable and later edits undo normally (`test/sketch.test.ts`).
- vitest covers pitch/roll/focal math (signs, 240 exact camera combinations, range fallback, every warning), coordinate
  spaces, store actions, and metadata round-trip including old and malformed files.

### Assumptions
- **No test sketch was supplied, so the fixture is synthetic**: `generate-sketch-fixture.mjs` draws two boxes on a ground grid
  through a pinhole camera and writes `synthetic-2pt.png` + `.json` (exact cues and truth). Swap in a real sketch any time; nothing
  depends on this one except its tests.
- The frame centre is taken as the sketch's optical centre (principal point). Panning or scaling the sketch moves which part of it
  sits at the centre, which is how a cropped sketch is corrected.
- The focal formula is `f² = −v1·v2`, not the spec's `sqrt(d1·d2)`; they agree when the horizon is level and through the
  centre, and only the general form is right otherwise (documented in solver-spec.md).
- VP order is a convention: VP 1 and VP 2 horizontal, VP 3 vertical.
- Yaw and camera position are not solved; the solve keeps them. After solving, switch to Shot cam (C) to compare.
- The sketch image is referenced by path, not copied into the export folder.
- Sketch opacity, visibility, lock and the active tool are not saved in scenes.

### Stubbed or deferred
- Landmark marking and the pose/depth solve (Phase 3B) and edit-after-solve (3C).
- No two-point numeric entry for cues; they are placed and dragged only.
- Electron main-process import dialog untested here (see status).

## 2026-10-22 — Phase 3B: Landmarks & Pose Solve

**Status: complete, awaiting acceptance in Electron.** Build green, 159 vitest tests passing (124 before). Checked in the
renderer-only preview with Tram's gesture sketch (landmarks placed by clicking, solve, heatmap, review, undo).

### What was built
1. **Guided landmark checklist** (`src/solve/landmarks.ts`, `src/panels/LandmarkPanel.tsx`): crown, chin, neck base, shoulders,
   elbows, wrists, hips, knees, ankles, toes (ball of the foot = toe direction); optional chest, waist, gaze. "Start marking" arms
   the first missing landmark and each click moves on to the next missing one; click a name to redo it, drag a marker to refine.
   Per-landmark depth hint (Near / Far = nearer or farther from the viewer than the joint it hangs from).
2. **Landmark layer** (`src/three/LandmarkOverlay.tsx`): stick figure over the sketch with a prompt naming the joint to click;
   markers take their joint's confidence colour after a solve, with "?" on ambiguous joints.
3. **Staged solver** (`src/solve/poseSolve.ts`, `depthResolve.ts`, `projection.ts`; solver-spec §2–4 "as implemented"):
   depth search (least foreshortening that fits the drawing) → root placement from the hips → torso, clavicles, head and gaze
   → limb depth resolve + analytic aim + CCD polish (8 iterations, joint limits) → grounding (figure and camera move together,
   which solves the camera height; planted feet snap onto the ground plane).
4. **Output is ordinary editable pose state**: no locks are added; locked joints, hands and depth nudges are kept.
5. **One undo step** (`solvePoseFromSketch` in `sketchSlice.ts`): pose, camera and the solve record together. If the perspective
   cues have not been solved since they changed, the camera solve (3A) runs inside the same step.
6. **Confidence heatmap**: green / yellow / red per joint (joint spheres) and per limb (segment tint), toggled by "Confidence" in
   the viewport; hidden in PNG export. Limb chips and warnings in the panel.
7. **"Next uncertain joint"** (`src/state/review.ts`, `src/ui/ReviewNext.tsx`): in the viewport and the panel; cycles red, then
   yellow, then ambiguous joints (worst residual first) and selects each so its controls open in the Pose tab.
8. Metadata: `sketch.depthHints` (new), `sketch.solve.settings.pose` and per-joint / per-limb confidence (metadata-schema.md
   "Phase 3B"). Older files load with no hints.

### Acceptance checks
- **Fixture sketch** (`test/poseFixture.ts`): nine library poses on the default body, landmarks projected through the real render
  path (applyShotCamera + Vector3.project). Documented envelope (`test/poseSolve.test.ts`): with all landmarks and the hints an
  artist would give, mean joint error < 7 cm, worst joint < 15 cm, hip depth within 3% (measured about 2–6 cm mean); with
  ±0.4% frame-height jitter over five seeds, mean < 15 cm and worst < 35 cm (the worst are hands and feet whose depth flips).
- **Tram's sketch** (checked by hand in the preview, 14 landmarks placed by eye, left ankle hidden): the solve succeeded, stayed
  inside joint limits and stood on the ground, with most joints within 8 cm of their rays. The right shoulder stayed red (about
  9 cm): the clavicle range cannot reach the drawn shoulder, which is what the review button points at. At Tram's request the
  sketch is not kept in the repo; the synthetic fixture is the automated acceptance test.
- **Heatmap colours match the spec**: every joint's colour equals the §4 residual rule (green < 2 cm, yellow < 8 cm), an unreachable
  IK target is at least yellow (§3), and each limb takes its worst joint (tested on all nine poses).
- **Undo restores the pre-solve state exactly** (deep-equal document), including when the camera was solved in the same step;
  redo re-applies it; later edits are separate undo steps.
- vitest covers projection (against the Three.js camera), depth resolve (two solutions, stretch residual, hints, behind-camera,
  thresholds), the staged solve and IK (limits, locks, reprojection, missing landmarks, feet off the ground), store actions,
  review ordering and metadata round-trip.

### Assumptions
- Tram's sketch was used only for the hand check in the preview and is not committed (removed at Tram's request).
- "Spine" from the deliverable list is covered by the optional chest and waist landmarks (the spine line runs hips → waist →
  chest → neck); there is no separate spine landmark.
- "Occlusion depth hints" are the per-landmark Near / Far toggles, relative to the parent joint.
- Landmark L/R are the figure's own sides. The hip and neck landmarks are joint centres, not bony landmarks.
- With "Feet on the ground" on (default) the solve moves the shot camera (position and target) together with the figure, so the
  camera height comes from the figure; the view through the camera is unchanged. Turn it off for jumps.
- Without a horizon or VPs the camera keeps its current pitch, roll and focal; the pose fits through that camera.
- The stylized override is ignored by the solve (the panel warns when it is active).
- Pose-solve options and the active landmark are UI state, not saved in scenes.

### Stubbed or deferred
- Sketch compare mode, partial limb re-solve, depth nudge handles, camera diagnostics panel and bake (Phase 3C).
- No automatic landmark detection (non-goal).
- Electron main-process sketch import still untested here; the preview loads the image through the dev server.

## 2026-10-23 — Phase 3B fix: extreme poses and strong perspective

**Status: on branch `fix/extreme-pose-solve`, not pushed.** Build green, 166 vitest tests passing.

### What was wrong
- Measured on synthetic extreme poses (falling with a hand thrust at the lens, kicks, random poses inside joint limits) through
  close wide-angle (12–16 mm), steep high-angle and worm's-eye cameras. With the true lens the solve already landed within
  about 1–8 cm. The failures came from the lens: without perspective cues the solve kept the camera's 50 mm, and wide-angle
  drawings then came out 10–19 cm wrong on average, with hands and feet off by up to 50 cm.
- Worm's-eye views also snapped planted feet onto the ground along nearly level rays, which threw the toes off.

### What changed (solver-spec §2–4 "as implemented", last three bullets)
1. **Lens from the figure** when no orthogonal VP pair fixed it: focal search 10–135 mm, best fit wins; reported as
   "Lens solved from the figure: N mm" and in `sketch.solve.settings.pose.focalSolved / focalMm`.
2. **Grazing rays**: planted feet seen within 10° of level are depth-resolved, not snapped.
3. **IK fallback**: when holding the drawn mid joint leaves the end joint more than 8 cm short, the whole limb may move.
- Tried and dropped: a whole-body Levenberg–Marquardt refinement after the staged solve. It fitted the rays more tightly but
  slid into other exact fits, making pose shapes worse (3 → 7.5 cm mean on the standard fixture).

### Acceptance checks (`test/poseSolve.test.ts`, "extreme poses and strong perspective")
- Tests written first; they failed on the previous solver. 4 cameras × 6 extreme poses with the lens starting at 50 mm:
  mean joint error < 10 cm, worst < 30 cm, at most one red joint; for the 12 mm close-up the lens must come within 35%.
- A lens fixed by the cues is kept; the solved lens is reported.
- Tram's example (`D:\Apps\Test\download.png`, not committed), with 16 landmarks placed by Claude by eye: the lens is solved as
  12 mm (was stuck at 50), and the falling pose with the hand thrust at the viewer lines up. Two joints stay red
  (left shoulder, right knee), partly because the left/right reading of that drawing is a guess.

### Known limits
- A moderate wide lens (16–28 mm at 2–4 m) is often not identifiable from the figure alone; the pose still overlays the drawing.
  Placing a horizon and two VPs fixes the lens exactly.
- A solve now takes about 0.3–0.8 s when the lens is searched (about 15 ms with a fixed lens).
- Falling or flying figures need "Feet on the ground" turned off.

### Summary
The pose-from-sketch solve now copes with strong perspective: when no horizon and vanishing points fix the lens, it finds
the focal length from the figure (Tram's falling figure: 12 mm instead of a fixed 50 mm), handles worm's-eye feet, and frees
a limb that holding the drawn joint would leave out of reach. Extreme-pose and extreme-camera tests were written first and now
pass; 166 tests and the build are green.

### Assumptions
- The lens is only searched when the perspective cues did not fix it (no orthogonal VP pair). A lens fixed by the cues is kept.
- The search range is 10–135 mm. A weak pull toward the camera's current focal keeps it from wandering when the figure says
  little about the lens.
- When the figure cannot tell a moderately wide lens apart, a matching overlay counts as success; the exact focal length is
  then the artist's to set (or pin with a horizon and two VPs).
- The landmarks used on Tram's example were placed by Claude by eye, including a guess at which side is the figure's left.
- Sensor height, camera position and look direction are not searched; the solve keeps them (grounding still moves figure and
  camera together).

## Phase 2B — Anatomy look (2026-10-22)

### What was built
- New "Look: Mannequin / Anatomy" toggle in the Body panel (`figureStyle` in the UI slice; not saved in scenes).
  The viewport and PNG export draw whichever look is on.
- `src/three/anatomy/muscles.ts`: a table of 22 blocks (about 40 with left/right copies) in matte study-figure colours:
  blue ribcage, waist and pelvis; green abdominal panel and biceps; orange deltoids and thighs; purple triceps; salmon
  forearms and knees; lilac shins with calves; yellow head, hands and feet; joint fillers at elbows, wrists, knees and
  ankles. Each block is a lathe "spindle" with its own widest point and end shape, authored on the left at the rest
  body and mirrored. Blocks scale per axis with their bone's segment, so presets and sliders still apply.
- `anatomyLayer.ts` parents the blocks to the mannequin's bone nodes, hides the grey segments (still pickable), tints the
  hands and hides plain joint markers. `anatomySync.ts` drives it from the store and is started after the scene sync.
- Docs: `docs/anatomy-spec.md` (behaviour, spindle maths, frames, slider fitting, block table, colours, limits) and
  `docs/anatomy-schema.json` (JSON Schema for the block table). `prompts/02b-anatomy-skin.md` records the phase brief.
- `test/anatomy.test.ts` (8 tests): ids and bones, mirroring, slider response, spindle profile, hide/restore, posing,
  and schema/code agreement on bones and colour groups.

### History
- First version: about 60 small écorché-style muscles after a ZBrush anatomy sheet. Tram found it too busy and shared a
  simpler reference (Sebastian Ramos colour-block figure); the table was replaced with the current large blocks.

### Known limits
- No skinning: at strongly bent shoulders, hips, elbows and knees the blocks overlap instead of blending.
- Hands stay the posable mannequin palm and fingers (in the hand colour), so they look blockier than the reference.
- While Anatomy is on, the confidence heatmap only shows on joint markers (segment tints are hidden).
- Closest match to the reference at the Heroic preset; Realistic Average is slimmer by design.

### Checks
- Typecheck and `electron-vite build` pass; the 8 anatomy tests pass. Four poseSolve "extreme poses" tests time out at
  5 s in the cloud build copy (about 7 s each there); they are unrelated to this phase.
## 2026-10-23 — Phase 3C: Edit after solve

**Status: complete, accepted by Tram 2026-10-22.** `npm run typecheck`, `npm run build` and `npm test`
green: 193 vitest tests passing (166 before); 201 after rebasing onto main with Phase 2B. Checked by hand in the renderer-only preview (fixture stick-figure sketch:
nudge handles and ghost, part re-solve, compare overlay with difference tint, diagnostics, trace lock, bake); no console errors.

### What was built
1. **Sketch compare mode** (`src/panels/ComparePanel.tsx`, `src/three/SketchLayer.tsx`): new Compare section in the Sketch tab.
   Overlay draws the sketch over the mannequin instead of under it (clicks still reach the joints); Difference tint inverts the
   paper to black, colours the lines and difference-blends them so lines stand out in a contrasting colour where they cross the
   figure; opacity slider; **Trace lock** freezes the shot camera (all camera setters, Reset) and the sketch placement and switches
   to the shot view, while posing stays free. The camera panel shows a banner with Unlock while it is on. View-only, not saved.
2. **Partial limb re-solve** (`resolvePart` in `src/solve/poseSolve.ts`, solver-spec "§5 as implemented"): the staged solve
   takes a part scope (torso, L/R arm, L/R leg) and re-runs §2–4 for that part only, through the current camera. Root, camera,
   every other joint and locked joints are kept. Buttons in the landmark panel (with each part's confidence dot) and
   "Re-solve <part> from the sketch" in the selected-joint panel. One undo step.
3. **Depth nudge handles** (`src/solve/depthNudge.ts`, `src/three/NudgeHandles.tsx`): selecting an elbow, wrist, knee, ankle or
   the head shows cyan handles beside it in the viewport: Near / Far steps (2 cm) and a grip to drag (left nearer, right
   farther). Hovering a step shows the limb where it would go as a ghost; while dragging, the ghost shows where it started.
   Same controls in the selected-joint panel, plus Clear. Bone lengths and joint limits are kept. Each nudge re-scores the
   solve confidence (joint colours, limb chips, review list) and is recorded in `pose.depthNudges`; a drag is one undo step.
4. **Camera diagnostics panel** (`src/solve/cameraDiagnostics.ts`, `src/panels/CameraDiagnosticsPanel.tsx`): overall confidence,
   focal length and where it came from (vanishing points / found from the figure / not fixed), the solved or suggested range,
   the shot camera's focal, pitch and roll; the cue warnings from the camera solve; and consistency checks: focal outside the VP
   range, focal / pitch / roll changed since the solve, a lens found from the figure that disagrees with the cues, three or more
   red joints, and a lens no cue fixes.
5. **Bake solve to manual pose** (landmark panel, two-click confirm): keeps pose and camera, clears the solve record
   (`baked: true`, no confidence), drops the nudges, and removes the solve steps from the undo history. Landmarks and cues stay.
6. History commands carry a `solve` tag (camera solve, pose solve, part re-solve) so bake can find them.
7. Metadata: `pose.depthNudges` and `sketch.solve.settings.pose.resolvedParts` are written; `baked` is used (metadata-schema.md
   "Phase 3C"). Still schema v1; older files load unchanged.

### Acceptance checks (`test/editAfterSolve.test.ts`, 27 tests)
- **Partial re-solve of one arm leaves every other limb unchanged**: in the store, after disturbing the left arm and locking the
  hand, re-solving `armL` leaves all 17 joints outside the arm, the locked hand, the root, the hands and the camera deep-equal; the
  arm is back on the drawing (elbow green). Pure-solver test does the same for every part. One undo step restores the document
  exactly.
- **Depth nudge visibly changes depth and updates confidence**: a 12 cm "farther" nudge on the solved left elbow moves it more than
  5 cm in view depth (equal to the recorded nudge), raises its residual by more than 1 cm and turns it from green to yellow/red;
  the camera confidence is untouched; undo restores. A bent elbow nudge moves exactly the asked depth with the wrist fixed; wrist
  and ankle nudges stay within 6 mm of their rays; locked joints refuse; a nudge is re-applied by a re-solve of its limb.
- **Bake keeps the pose and clears the solve status**: joints, root, camera and landmarks unchanged; `sketch.solve` =
  `{ settings: {}, confidence: {}, baked: true }`; no solve step left in history; undoing later edits never brings the solve back;
  a later full solve starts a fresh un-baked record.
- **Metadata round-trip** stays deep-equal with nudges, re-solved parts and the baked record.
- Camera diagnostics: every check (VP range, focal/pitch/roll drift, figure lens vs cues, red joints, suggested range, pose-only).
- Trace lock blocks camera and placement edits but not posing.

### Assumptions
- **Parts**: "torso" includes neck and head; the clavicles belong to the arms (they are in the §3 arm chain). Re-solving the torso
  keeps the root fixed (§5 says preserve root), so the hips turn under it and the arms and legs move with the torso.
- **Re-solve needs a full pose solve first** (it refines one part of it); before that the panel asks for a full solve.
- **Nudge direction is view depth** along the shot camera's axis, positive = farther, as with the Near / Far depth hints. Which joints
  move: elbow/knee swing about the shoulder–wrist (hip–ankle) line so the wrist stays put; a nearly straight limb tips instead
  (the wrist then moves); wrist/ankle slide along their own ray (they stay on the drawing, the elbow/knee gives); the head turns the
  neck. Nudges are not offered on the hips, spine, chest or shoulders.
- **Nudges are standing corrections**: they are re-applied after a full solve and after a re-solve of their limb. Clear takes a
  nudge back out geometrically (positions return to within a few millimetres).
- A nudge re-scores confidence only when there is a pose solve to score against; without one it just moves the joint.
- **Bake is not undoable**: undo steps hold whole documents, so stepping back past the solve would restore it. Bake therefore drops
  every step up to the last solve and rewrites the later ones to the baked record (and clears the redo stack). The button asks for
  a second click. Bake also clears the nudges, since without a solve they have nothing to be offsets from.
- After a bake, the next pose solve re-solves the camera from the cues if there are any (their camera solve was cleared too).
- **Difference tint** is a CSS blend (invert + tint + difference), viewport-only. It is clearest with dark lines on light paper.
- **Trace lock** freezes the shot camera against the camera controls only; a pose solve may still move camera and figure together
  (grounding), which keeps the view through the camera unchanged.
- The ghost and nudge handles use the unscaled body (like the solve); with a stylized override active they can sit slightly off
  the scaled figure.

### Stubbed or deferred
- No keyboard shortcuts for nudging. The handles are HTML next to the joint, not 3D arrows (they work the same in both cameras).
- Electron main-process sketch import still untested here; the preview check used a canvas-drawn sketch loaded through the store.

### Summary
After a solve the artist can now compare the mannequin against the drawing (overlay, difference tint, trace lock), re-fit one limb or
the torso without touching the rest, push an elbow, wrist, knee, ankle or the head nearer or farther with a ghost preview while the
confidence colours update, read why the camera may not match (diagnostics panel), and bake the result into an ordinary manual pose.
