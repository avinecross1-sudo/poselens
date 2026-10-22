Read CLAUDE.md and docs/. Implement Phase 2B: Anatomy look.

Goal: an optional way to draw the mannequin as a simplified colour-block study figure: a few large, smooth,
matte masses per region (Tram's second reference, by Sebastian Ramos). A first, detailed 60-muscle ecorche version
was rejected as too busy. Built from procedural primitives, no imported meshes.

Deliverables:
1. Muscle table in `src/three/anatomy/muscles.ts`: each form names its bone, colour group, centre, size, rotation
   and spindle profile. Left side authored, right side mirrored. Pure and unit-tested.
2. Forms scale with their bone's segment so body presets and sliders still apply.
3. Masses: pelvis "briefs" and glutes; waist with a green abdominal panel; ribcage and traps; neck, skull and jaw;
   deltoid, biceps (front) and triceps (back); forearm; thigh; knee; shin and calf; feet and toes; joint fillers at
   elbows, wrists, knees and ankles.
4. "Look: Mannequin / Anatomy" toggle in the Body panel. Viewport and PNG export follow it.
5. While Anatomy is on: grey segments hidden but still pickable, hands tinted, plain joint markers hidden.

Acceptance:
- Screenshots front, back, side, 3/4 next to the reference read as the same kind of figure.
- Average, heavy, heroic and child presets keep sensible muscle placement.
- A bent pose keeps forms attached to their bones.
- vitest green, build passes.

When done: append to docs/progress.md and stop.
