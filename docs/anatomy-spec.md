# Anatomy Look Spec

The Anatomy look (Phase 2B) is a second way to draw the same mannequin. It shows simple, matte colour blocks,
one colour per body region, after Tram's simplified study figure (Sebastian Ramos reference). It adds no bones,
joints, state that is saved, or solver inputs. It only changes what is drawn.

The data format is in [anatomy-schema.json](anatomy-schema.json). The code lives in `apps/desktop/src/three/anatomy/`.

## Behaviour
- **Toggle:** Body panel → *Look: Mannequin / Anatomy*. Stored as `figureStyle: 'mannequin' | 'anatomy'` in the UI slice.
  It is not saved in scenes or export metadata, and it defaults to `'mannequin'` on launch.
- **Viewport and export:** both draw whichever look is on. Transparent PNG export needs no change, because the forms are
  ordinary meshes in the scene.
- **While Anatomy is on:**
  - The grey mannequin segments are hidden (`visible = false`), but they stay in `pickables`. Three.js raycasting
    ignores visibility, so clicking a block still selects the bone underneath it.
  - Hands keep the mannequin's posable palm and fingers, so hand shapes still work. They are re-coloured with the `hand` colour.
  - Joint markers are hidden while they have the plain joint material. Selected, locked and confidence-coloured
    markers stay visible.
  - The confidence heatmap only shows on joint markers, because the segment tints are hidden.
- **The depth-nudge ghost** is a separate mannequin and is never drawn in the Anatomy look.

## Geometry: the spindle
Every block is a lathe solid ("spindle") around its local Y axis, running from y = −0.5 to +0.5 with a maximum radius of 0.5.

```
radius(t) = 0.5 · sin(π·u)^ends          t ∈ [0, 1] from the −Y end to the +Y end
u = t < peak ? 0.5·t/peak : 0.5 + 0.5·(t − peak)/(1 − peak)
```

- `peak` (0–1) sets where the widest point is. Above 0.5 makes the top heavier, which suits most limb masses.
- `ends` sets the taper. 0.5 is close to an ellipsoid, lower is fuller and more box-like (torso shells, the belly
  panel), and 1 is lemon-pointed.
- Default profile: `peak 0.5, ends 0.55`.
- Tessellation: 14 profile steps × 20 radial segments. One geometry is shared by every block with the same profile.
- Mesh transform: `scale = size`, then `rotation = rot` (XYZ Euler, radians), then `position = center`, all in the bone's local frame.
- Material: `MeshStandardMaterial`, roughness 0.8, metalness 0, one material per colour group.

## Frames and authoring
- Each block is parented to a mannequin bone node, so it poses rigidly with that bone. There is no skinning.
- Values are authored in **rest-body metres** (neutral sliders, 1.75 m) in the bone's local frame. Bones have no rest
  rotation, so at rest: +Y is up, +X is the character's **left**, and +Z is the **front**.
- **Mirroring:**
  - Side bones (`shoulder, upperArm, forearm, hand, thigh, shin, foot, toe`) are authored once for the left side and
    produce `<id>L` and `<id>R`.
  - Central bones (`hips, spine, chest, neck, head`) produce one block called `<id>`. With `mirror: true` they produce
    `<id>L` (as authored) and `<id>R` (mirrored).
  - Mirroring negates `center.x` and `rot.y` and `rot.z`, and keeps `rot.x`.

## Fitting to the body (sliders and presets)
`placeMuscles(rig)` scales each block's `center` and `size` per axis by its bone's scale `k` compared with the rest rig:

| Bone segment | k |
|---|---|
| box (hips, chest, hand, foot, toe) | current box size ÷ rest box size, per axis |
| sphere (head) | radius ratio on all axes |
| capsule along Y (neck, arms, legs) | [radius ratio, length ratio, radius ratio] |
| capsule along X (shoulder) | [length ratio, radius ratio, radius ratio] |
| spine (special case) | [radius ratio, chest-offset ratio, radius ratio], so the waist fills the gap to the chest |

Rotations are not rescaled. Under strongly non-uniform scaling, tilted blocks keep their authored angle.

## Block table (current)
Values are in rest-body metres. Profile is shown as peak / ends.

| id | bone | colour | center | size | rot | profile | instances |
|---|---|---|---|---|---|---|---|
| pelvis | hips | torso | [0, -0.045, 0] | [0.3, 0.25, 0.2] | - | 0.7 / 0.45 | single |
| glute | hips | torso | [0.05, -0.065, -0.03] | [0.14, 0.19, 0.12] | - | 0.5 / 0.55 | mirrored |
| waist | spine | torso | [0, 0.08, -0.004] | [0.23, 0.28, 0.18] | - | 0.5 / 0.42 | single |
| abdomen | spine | abdomen | [0, 0.08, 0.04] | [0.2, 0.26, 0.1] | - | 0.5 / 0.25 | single |
| ribcage | chest | torso | [0, 0.15, 0] | [0.36, 0.38, 0.23] | - | 0.75 / 0.42 | single |
| trap | chest | torso | [0.06, 0.255, -0.02] | [0.14, 0.09, 0.1] | [0, 0, -0.4] | 0.5 / 0.55 | mirrored |
| neck | neck | head | [0, 0.035, 0] | [0.1, 0.15, 0.1] | - | 0.5 / 0.55 | single |
| skull | head | head | [0, 0.09, -0.005] | [0.185, 0.24, 0.215] | - | 0.62 / 0.5 | single |
| jaw | head | head | [0, 0.04, 0.012] | [0.13, 0.14, 0.16] | - | 0.65 / 0.5 | single |
| deltoid | upperArm | deltoid | [0.012, -0.05, 0] | [0.135, 0.2, 0.14] | - | 0.65 / 0.55 | L + R |
| biceps | upperArm | biceps | [0, -0.16, 0.016] | [0.088, 0.25, 0.085] | - | 0.55 / 0.5 | L + R |
| triceps | upperArm | triceps | [0, -0.145, -0.02] | [0.092, 0.27, 0.088] | - | 0.65 / 0.55 | L + R |
| elbow | forearm | forearm | [0, -0.005, -0.004] | [0.06, 0.07, 0.06] | - | 0.5 / 0.5 | L + R |
| forearm | forearm | forearm | [0, -0.125, 0] | [0.098, 0.29, 0.088] | - | 0.75 / 0.5 | L + R |
| wrist | hand | hand | [0, -0.005, 0] | [0.035, 0.05, 0.06] | - | 0.5 / 0.5 | L + R |
| thigh | thigh | thigh | [0, -0.205, 0.004] | [0.175, 0.48, 0.17] | - | 0.7 / 0.5 | L + R |
| knee | shin | forearm | [0, -0.01, 0.004] | [0.085, 0.09, 0.085] | - | 0.5 / 0.5 | L + R |
| shin | shin | shin | [0, -0.2, 0] | [0.08, 0.41, 0.085] | - | 0.6 / 0.5 | L + R |
| calf | shin | shin | [0, -0.12, -0.024] | [0.1, 0.23, 0.1] | - | 0.68 / 0.5 | L + R |
| ankle | foot | hand | [0, 0.005, -0.004] | [0.06, 0.09, 0.065] | - | 0.5 / 0.5 | L + R |
| foot | foot | hand | [0, -0.035, 0.04] | [0.085, 0.2, 0.065] | [1.571, 0, 0] | 0.4 / 0.45 | L + R |
| toes | toe | hand | [0, 0, 0.025] | [0.085, 0.06, 0.04] | [1.571, 0, 0] | 0.5 / 0.42 | L + R |

## Colour groups

| group | hex |
|---|---|
| head | #cdb94f |
| torso | #7f9bd6 |
| abdomen | #8cc44a |
| deltoid | #dc6d38 |
| biceps | #8cc44a |
| triceps | #b47ad8 |
| forearm | #d9706e |
| hand | #d5c25a |
| thigh | #d05e3a |
| shin | #b592cf |

## Known limits
- No skinning: at strongly bent shoulders, hips, elbows and knees the blocks overlap instead of blending.
- Hands stay blocky (the mannequin's palm and fingers).
- The default "Realistic Average" body is slimmer than the reference; the Heroic preset matches it most closely.
- The look is not saved per scene. If it ever needs to be, add `figureStyle` to the scene settings, and add it to
  metadata-schema.md with `'mannequin'` as the default for older files.

## Changing the look
1. Edit `MUSCLES` / `MUSCLE_COLORS` in `muscles.ts`, following anatomy-schema.json.
2. Run `npx vitest run test/anatomy.test.ts`. It checks ids, bones, mirroring, slider scaling, and that the schema's
   bone and colour lists match the code.
3. Compare against the reference from the front, back, side and 3/4, at the Average and Heroic presets and in a bent pose.
4. Update the table above.
