# Scene Metadata Schema v1

Saved as `{SceneName}/export.json` next to `export.png`. Also used for `scene.json`.
Include `"schemaVersion": 1`. Migrate on load if version differs.

```json
{
  "schemaVersion": 1,
  "app": { "name": "PoseLens", "version": "0.1.0" },
  "canvas": { "aspect": 1.5, "widthPx": 2000, "heightPx": 1333 },
  "scene": { "groundPlane": true, "grid": true, "horizon": true },
  "body": {
    "presetId": "athletic",
    "modifiedFrom": "athletic",
    "sliders": { "height": 1.78, "mass": 0.6, "shoulderHipRatio": 1.3, "...": 0 },
    "locks": { "height": true },
    "asymmetry": { "leftArmThickness": 1.0, "rightArmThickness": 0.95 },
    "stylizedOverride": { "matrix": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], "acknowledged": true }
  },
  "pose": {
    "joints": { "thighL": { "rx": 0, "ry": 0, "rz": 0 }, "...": {} },
    "rootTransform": { "position": [0,0,0], "rotation": [0,0,0] },
    "ikLocks": [], "jointLocks": [], "depthNudges": {}
  },
  "camera": {
    "position": [0, 1.6, 3], "target": [0, 1.0, 0], "up": [0,1,0],
    "focal": 50, "sensorHeight": 24, "roll": 0, "aspect": 1.5,
    "preset": "full-body"
  },
  "sketch": {
    "hash": "sha256:...", "path": "sketch.png",
    "alignment": { "x": 0, "y": 0, "scale": 1, "rotation": 0 },
    "landmarks": { "head": [x,y], "chin": [x,y], "...": [] },
    "horizon": [[x,y],[x,y]], "vps": [[x,y]],
    "solve": { "settings": {}, "confidence": { "armL": "green" }, "baked": false }
  },
  "balance": { "com": [0,1,0], "supportPolygon": [], "contacts": [], "warnings": [] },
  "variants": [ { "id": "v1", "name": "hero", "camera": {}, "pose": {} } ],
  "export": { "preset": "clean", "namingTemplate": "{scene}_{variant}_{n}", "settings": {} },
  "tags": [], "notes": ""
}
```

## Notes (Phase 1)
- `pose.joints` is keyed by hierarchy node name (the node that rotates), e.g. `thighL`, `forearmR`.
  Rotations are radians, Euler order `XYZ` (`JOINT_EULER_ORDER` in `src/types/scene.ts`).
- `scene` holds viewport helper toggles. `canvas.aspect` is the source of truth for aspect;
  `camera.aspect` is written from it and ignored on load if they differ.
- Until camera presets exist, `camera.preset` is `"custom"`.
- `sketch`, `balance` and `variants` are written as empty defaults until their phases.
- Missing fields fall back to defaults on load; a `schemaVersion` newer than the app is rejected.

## Notes (Phase 2)
Still `schemaVersion: 1`: every Phase 2 field is additive and Phase 1 files load unchanged.
- `body.sliders` holds all 21 sliders (`BODY_SLIDER_KEYS` in `src/types/scene.ts`), grouped as
  Proportions, Limbs, Shape / Depth and Advanced. Missing sliders load at their neutral value.
- `body.locks` keys are slider names or `group:<proportions|limbs|shape|advanced>`.
- `body.asymmetry` keys: `left|rightArmThickness`, `left|rightLegThickness` (multipliers, 1 = none),
  `left|rightShoulderHeight`, `left|rightHipHeight` (meters at 1.75 m). Only non-neutral keys are written.
- `body.stylizedOverride.matrix` is a 4x4 column-major matrix (THREE.Matrix4.elements), applied above
  the root only while `acknowledged` is true.
- `body.presetId` may be a user preset id (`custom-…`) with `modifiedFrom` naming its base preset.
  User presets live in the app's user library, not in the scene file.
- `pose.hands` = `{ "L": shape, "R": shape }`, shape one of `relaxed | open | fist | pointing | gripping`.
- `pose.jointLocks` lists joint names; `pose.ikLocks` lists locked limb chains (`armL`, `armR`, `legL`, `legR`).

## Notes (Phase 3A)
Still `schemaVersion: 1`: all additions are backwards compatible; older files load with the defaults below.
- `sketch.size` = `{ "width": px, "height": px }` of the imported image (new; `null` until a sketch is imported).
- `sketch.path` is the absolute path of the imported file at import time (the image is not copied into
  the export folder). `sketch.hash` is `sha256:<hex>` of the file. On load the app re-reads `path`, and
  if the file is missing or its hash differs it keeps the cues and tells the user to import the image again.
- Cue points (`horizon`, `vps`, later `landmarks`) are in **image space**: `[u, v]` with the origin at the
  image's top-left, `u` across and `v` down, 0..1 over the image. They may lie outside 0..1 (vanishing
  points usually do). They move with the sketch when `alignment` changes.
- `sketch.alignment` = `{ x, y, scale, rotation }` in **frame space**: the sketch is fitted inside the shot
  frame ("contain"), then scaled by `scale`, rotated by `rotation` radians counter-clockwise about its
  centre, and offset by `x`, `y`, measured in frame heights (+y up). The frame centre is the principal point.
- `sketch.vps`: at most 3. `vps[0]` and `vps[1]` are the two orthogonal horizontal vanishing points,
  `vps[2]` the vertical one. `sketch.horizon` is two points defining the horizon line.
- `sketch.solve.settings` holds the last camera solve (`pitch`, `roll` in radians, `focalMm`,
  `focalRangeMm`, `pitchRange`, `focalSolved`, `horizonSource`, `warnings`); `confidence.camera` is
  green / yellow / red. It is cleared when a cue or the placement changes afterwards. `baked` stays
  `false`: a solved camera is an ordinary editable camera.
- Sketch opacity, visibility and lock are view settings and are not saved.
