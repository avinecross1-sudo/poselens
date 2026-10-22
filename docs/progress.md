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
