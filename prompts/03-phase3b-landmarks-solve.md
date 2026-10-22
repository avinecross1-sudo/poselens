Read CLAUDE.md and docs/solver-spec.md. Phase 3A complete.
Implement Phase 3B: Landmark marking and pose solve.

Deliverables:
1. Guided landmark checklist: head, chin, neck, shoulders L/R, elbows L/R,
   wrists L/R, hips L/R, knees L/R, ankles L/R, feet toe direction.
   Optional: spine, chest, waist, gaze, occlusion depth hints.
2. Staged solver per docs/solver-spec.md §2-4:
   root placement → limb IK → depth resolve.
3. Output = editable pose state, NOT locked.
4. Confidence heatmap (green/yellow/red) per joint and limb.
5. "Next uncertain joint" review button cycles low-confidence joints.
6. The whole solve is ONE undoable history step.

Acceptance:
- Completing all landmarks on the fixture sketch produces a starting pose
  within a reasonable error envelope (documented threshold in tests).
- Confidence heatmap colors match confidence rules in solver-spec.
- Undo restores the pre-solve state exactly.
- vitest covers projection, IK, depth resolve.

When done: append to docs/progress.md and stop.
