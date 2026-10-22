Read CLAUDE.md and docs/solver-spec.md. Phase 3B complete.
Implement Phase 3C: Edit after solve.

Deliverables:
1. Sketch compare mode: overlay toggle, difference tint, opacity, trace lock.
2. Partial limb re-solve per solver-spec §5: select arm/leg/torso, re-solve only
   that chain, preserve locked joints.
3. Depth nudge handles on selected joint (forward/back) with limb ghost preview.
4. Camera solve diagnostics panel: suggested focal range, confidence,
   inconsistency warnings.
5. "Bake solve to manual pose" action (removes solve history entry, keeps pose).

Acceptance:
- Partial re-solve of one arm does not disturb other limbs (test).
- Depth nudge visibly changes depth and updates confidence.
- Bake action works and clears solve status.
- vitest green.

When done: append to docs/progress.md and stop.
