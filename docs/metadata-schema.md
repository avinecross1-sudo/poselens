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
