Read CLAUDE.md and docs/. Phase 3 complete. Implement Phase 4:
Feedback, Reuse, Variants.

Deliverables:
1. Silhouette/readability toggles: flat silhouette, negative-space highlight,
   value-block preview, ground-shadow toggle.
2. Ground contact + balance per docs/balance-spec.md:
   contact detection, support polygon, CoM (weighted by body-profile mass ratios),
   balance line, lean indicator, weight-shift visualization, warnings.
   CoM must respond to body sliders.
3. Depth shading and occlusion hints.
4. Wide-lens distortion preview (highlight at focal < 24mm).
5. Clipboard: copy/paste camera, body profile, pose across scenes, with provenance.
6. Multi-shot variants: 2-4 named camera+pose snapshots, side-by-side compare,
   duplicate scene.
7. Export presets: Clean, Lineart, Flat silhouette, Shaded; grid/shadow on/off;
   viewport vs bounds vs fixed canvas; naming template.
8. Re-import: PNG + sidecar restores full scene (round-trip test).
9. Tags and notes on scenes and presets.

Acceptance:
- CoM outside support polygon raises a visible warning (test fixture).
- Heavy preset slider changes visibly move CoM.
- Copy body profile A → paste into scene B retargets pose.
- Re-import PNG + sidecar restores scene within tolerance.
- vitest green; balance polygon computation covered.

When done: append to docs/progress.md, produce electron-builder release
candidates for macOS and Windows, and stop.
