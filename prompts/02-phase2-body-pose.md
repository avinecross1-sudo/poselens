Read CLAUDE.md and docs/. Phase 1 complete. Implement Phase 2: Body & Pose Depth.

Deliverables:
1. Full slider taxonomy: Proportions, Limbs, Shape/Depth, Advanced.
   Group locks, reset group, reset all, symmetry toggle.
2. Preset blending A→B with live preview. Save blended result as custom preset
   labeled "Modified from [X]".
3. Asymmetry: L/R limb thickness, shoulder/hip asymmetry.
4. Stylized solve override: per-scene non-uniform scale with acknowledged flag
   stored in metadata, UI warning when active.
5. Joint locks + limb-chain locks. Locked joints preserved across all edits.
6. IK drag handles per docs/solver-spec.md (CCD, joint limits, per-chain toggle).
7. Pose preset library (seed from seeds/pose-library.json), tags, favorites, search.
8. Mirror pose. Blend two poses with slider.
9. Pose retargeting on body change: preserve rotations, rescale bone lengths,
   warn on infeasible poses.
10. Hand/foot pose presets (open, fist, pointing, gripping) + foot toe direction.
11. Head-unit + measurement overlay per CLAUDE.md.
12. Gaze/eye-line vector on head bone.

Acceptance:
- Blending Athletic→Heavy is coherent.
- IK drag doesn't violate joint limits.
- Loading a scene under a different body preset retargets + warns if needed.
- Pose blend is plausible.
- Metadata round-trip still passes vitest.

When done: append to docs/progress.md and stop.
