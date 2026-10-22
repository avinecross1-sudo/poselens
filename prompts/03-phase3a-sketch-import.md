Read CLAUDE.md and docs/solver-spec.md. Phase 2 complete.
Implement Phase 3A: Sketch import and perspective cues.

Deliverables:
1. Import PNG/JPG via Electron file dialog. Display as background layer in the
   EDITOR camera with opacity, lock, show/hide, scale/rotate/pan.
2. Tools to place a horizon line (2 points) and 1-3 vanishing points.
3. Camera solve per docs/solver-spec.md §1: estimate pitch/roll + focal range,
   store in metadata, warn on inconsistent VPs.
4. UI panel for perspective cues, next to the Sketch panel.
5. Camera solve produces an EDITABLE camera state, never a locked one.

Acceptance:
- Importing a test sketch, placing horizon + 2 VPs, produces a camera that
  visually matches on the fixture in apps/desktop/test/fixtures/.
- Undo restores the pre-solve camera exactly.
- vitest covers pitch/roll/focal math.

When done: append to docs/progress.md and stop.
