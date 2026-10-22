# Project: PoseLens — Desktop Camera-First Posing Studio

## What this is
A desktop app for 2D artists (comic, illustration) to pose a parametric 3D mannequin,
set a camera, and export transparent PNG reference. It also supports importing a
sketch, marking landmarks, and solving an editable pose + camera.

## Non-goals (do not build)
- No AR, no mobile, no web deployment.
- No PSD/layered export — transparent PNG only.
- No clothing simulation, no animation timeline, no multiplayer.
- No full auto landmark detection. Landmark solve is user-guided.
- No imported 3D meshes. Mannequin is built from primitives.

## Stack (locked — do not substitute)
- Electron (main process) + Vite (renderer build)
- React 18 + TypeScript (strict)
- Three.js for the 3D viewport
- Zustand for app state (single store, sliced per domain)
- Tailwind CSS for UI
- vitest for unit tests, playwright for smoke tests
- electron-builder for packaging (macOS + Windows)

## Repo layout
```
/apps/desktop/electron/       # main + preload (all file I/O here)
/apps/desktop/src/
  /state                      # zustand slices: scene, body, pose, camera, sketch, balance, export, variants, clipboard
  /three                      # viewport, mannequin, camera rig, helpers, gizmos
  /panels                     # left/right/bottom UI
  /solve                      # sketch-assist solver modules
  /export                     # png + metadata
  /ui                         # shared components
/apps/desktop/src/types       # shared TS types (scene, metadata schema)
```

## Coordinate & unit conventions
- Three.js Y-up, right-handed.
- 1 unit = 1 meter. Mannequin default height 1.75m.
- Camera up = +Y. Horizon = Y of camera position.
- Angles stored in radians in state; displayed in degrees in UI.
- Focal length in mm; sensor height default 24mm (full-frame vertical).

## Two cameras (critical — do not merge)
- EDITOR camera: free orbit/pan/zoom for the artist, NOT part of scene metadata.
- SHOT camera: the character-framing camera, fully state-driven, saved in metadata.
The viewport has a toggle between them. OrbitControls may only drive the EDITOR camera.

## Mannequin model (MVP — primitives only)
Hierarchy (each node = THREE.Object3D with position/rotation/scale):
```
  root
    hips
      spine
        chest
          neck -> head
          shoulderL -> upperArmL -> forearmL -> handL
          shoulderR -> upperArmR -> forearmR -> handR
      thighL -> shinL -> footL -> toeL
      thighR -> shinR -> footR -> toeR
```
Each limb segment = capsule geometry; joints = small spheres; torso = box/capsule;
head = sphere; hands/feet = small boxes.
Body sliders drive bone scale + capsule radius. Presets are recipes of those values.

## Head-unit & measurement overlay (Phase 2)
- One head unit = crown (top of head) to chin. On the sphere head that is 2 × head radius.
- Tick marks at every head unit from the crown down to the floor, with a total label
  such as "7.5 heads". Realistic adult ≈ 7.5, heroic ≈ 8+, child ≈ 5–6, chibi ≈ 2–4.
- Also shows standing height, shoulder width, hip width, and the bone lengths of the
  selected limb.
- Measured from the rest skeleton (not the posed figure), so numbers stay put while posing.
- Viewport-only toggle. Never appears in exported PNGs.

## State shape (Zustand, single store, sliced)
- scene:    canvasRatio, groundPlane, grid, sketchLayer
- body:     presetId, modifiedFrom, sliders{}, locks{}, asymmetry{}, stylizedOverride
- pose:     joints{}, hands{}, rootTransform, ikLocks, jointLocks, depthNudges
- camera:   position, target, up, focal, sensorHeight, roll, preset
- sketch:   landmarks{}, horizon, vps[], solveStatus, confidence{}
- balance:  supportPolygon, com, contactFlags, warnings
- variants: array of { id, name, camera, pose }
- clipboard: { camera?, body?, pose? } each with provenance
- export:   preset, namingTemplate, settings
- history:  command stack (do/undo)

## Coding standards
- TS strict. No `any` without an inline justification comment.
- All state mutations via Zustand actions. Never mutate state directly.
- Three.js scene is a *projection* of state, not a source of truth. Sync via subscription.
- All file I/O goes through Electron preload IPC. Renderer never touches fs.
- No magic numbers in solver code — named consts with comments.
- Every solver helper has vitest coverage.

## Definition of done (every phase)
- Build passes, vitest green.
- `npm run dev` launches Electron + Vite HMR.
- Session log appended to `docs/progress.md`.
- Stop after the phase — do not pre-build future phases.
