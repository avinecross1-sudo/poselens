Read CLAUDE.md and docs/. Implement Phase 1: Core Studio.

Deliverables:
1. Electron + Vite + React + TS + Three.js + Zustand + Tailwind project skeleton
   in /apps/desktop. `npm run dev` launches an Electron window with Vite HMR.
2. Three.js viewport with an EDITOR orbit camera and a SHOT camera per CLAUDE.md.
   Viewport toggle switches between them. OrbitControls drive EDITOR only.
3. SHOT camera controls: height, target height, yaw, pitch, roll, focal length
   (8-300mm), sensor height, aspect ratio. Live preview through SHOT camera.
4. Primitive mannequin per CLAUDE.md. Default preset "Realistic Average".
5. Body panel: preset cards + Overall slider group only (height, mass, muscle,
   softness, shoulder-hip ratio). Sliders drive bone scale + capsule radius.
6. Joint posing: click joint → rotation gizmo (forward kinematics only, no IK).
7. Ground plane with grid. Horizon line helper.
8. Scene save/load as JSON via Electron file dialogs (all I/O in main/preload).
9. Transparent PNG export of SHOT camera. Sidecar .json per metadata schema.
10. Left panel = body + sliders. Center = viewport. Right = camera + export.
    Bottom = undo/redo bar.

Do NOT build: Sketch Assist, IK, locks, blending, variants, balance, clipboard.

Acceptance:
- `npm run dev` opens Electron, mannequin visible, camera toggle works.
- Body slider visibly changes the mannequin.
- Joint rotation gizmo works.
- Focal length change visibly changes framing.
- Export = transparent PNG + matching .json sidecar.
- Loading the sidecar restores scene exactly (vitest round-trip).
- vitest green.

When done: append to docs/progress.md (what built, what deferred, assumptions).
Stop.
