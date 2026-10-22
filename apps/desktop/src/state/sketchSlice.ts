import type { StateCreator } from 'zustand'
import { clamp } from '../lib/units'
import { imageToFrame, MAX_SKETCH_SCALE, MIN_SKETCH_SCALE } from '../lib/sketchSpace'
import { lockedJoints } from '../lib/poseOps'
import { applySolution, solveFromSketch, type CameraSolution } from '../solve/cameraSolve'
import { isLandmarkId, LANDMARKS, type DepthHint, type LandmarkId } from '../solve/landmarks'
import { MAX_NUDGE_M, nudgeBlocked, nudgeDepth, type NudgeJoint } from '../solve/depthNudge'
import { PART_JOINTS, PART_LABEL, resolvePart, scorePose, solvePose, type JointReport, type PoseSolution, type PoseSolveResult } from '../solve/poseSolve'
import { poseWarnings } from '../solve/retarget'
import { MAX_VPS, type ConfidenceLevel, type JointName, type PoseState, type SketchMeta, type Vec2 } from '../types/scene'
import { defaultSketch } from './defaults'
import { sameDoc } from './historySlice'
import { rigOf, stylizeOf } from './rigOf'
import type { Doc, SketchSlice, Store } from './types'

/** Recorded in sketch.solve.settings so a saved scene shows what the last solve found. */
const solveSettings = (s: {
  pitch: number
  roll: number
  focalMm: number
  focalRangeMm: [number, number]
  pitchRange: [number, number]
  focalSolved: boolean
  horizonSource: string
  warnings: string[]
}): Record<string, unknown> => ({ ...s })

/** Edits that change the cues make an earlier solve stale. */
const clearSolve = (s: SketchMeta): SketchMeta['solve'] => (s.solve.baked ? s.solve : { settings: {}, confidence: {}, baked: false })

/** Edits that change the landmarks make an earlier pose solve stale; the camera solve still stands. */
function clearPoseSolve(s: SketchMeta): SketchMeta['solve'] {
  if (s.solve.baked) return s.solve
  const { pose: _pose, ...settings } = s.solve.settings
  const camera = s.solve.confidence['camera']
  return { settings, confidence: camera ? { camera } : {}, baked: false }
}

/** What a saved scene keeps about the last pose solve (sketch.solve.settings.pose). */
function poseSolveRecord(sol: PoseSolution, cameraSolved: boolean): Record<string, unknown> {
  const joints = Object.entries(sol.joints).filter((e): e is [string, JointReport] => e[1] !== undefined)
  return {
    depth: sol.depth,
    grounded: sol.grounded,
    planted: sol.planted,
    cameraSolved,
    focalSolved: sol.focalSolved,
    focalMm: sol.camera.focal,
    residualsCm: Object.fromEntries(joints.map(([j, r]) => [j, Math.round(r.residual * CM_PER_M * 10) / 10])),
    ambiguous: joints.filter(([, r]) => r.ambiguous).map(([j]) => j),
    unreachable: joints.filter(([, r]) => r.unreachable).map(([j]) => j),
    warnings: sol.warnings,
  }
}

const CM_PER_M = 100

/** Landmarks of known ids, image space -> frame space. */
function frameLandmarks(sketch: SketchMeta, frameAspect: number): Partial<Record<LandmarkId, Vec2>> {
  if (!sketch.size) return {}
  const imageAspect = sketch.size.width / sketch.size.height
  return Object.fromEntries(
    Object.entries(sketch.landmarks)
      .filter(([k]) => isLandmarkId(k))
      .map(([k, p]) => [k, imageToFrame(p, sketch.alignment, imageAspect, frameAspect)]),
  )
}

/** A nudge that moves the joint less than this (m) changes nothing worth an undo step. */
const MIN_NUDGE_MOVE_M = 1e-5

/** The record of the last pose solve (sketch.solve.settings.pose), or null before any. */
function poseRecord(s: SketchMeta): Record<string, unknown> | null {
  const p = s.solve.settings['pose']
  return typeof p === 'object' && p !== null && !Array.isArray(p) && Object.keys(p).length > 0 ? (p as Record<string, unknown>) : null
}

const jointList = (v: unknown): Set<JointName> => new Set(Array.isArray(v) ? v.filter((x): x is JointName => typeof x === 'string') : [])

/** Joint reports of a pose against the landmarks, written into the solve record (camera entries kept). */
function withReport(
  solve: SketchMeta['solve'],
  rec: Record<string, unknown>,
  report: ReturnType<typeof scorePose>,
  extra: Record<string, unknown> = {},
): SketchMeta['solve'] {
  const camera = solve.confidence['camera']
  const confidence: Record<string, ConfidenceLevel> = camera ? { camera } : {}
  const joints = Object.entries(report.joints).filter((e): e is [string, JointReport] => e[1] !== undefined)
  for (const [j, r] of joints) confidence[j] = r.confidence
  for (const [l, c] of Object.entries(report.limbs)) if (c) confidence[l] = c
  const pose = {
    ...rec,
    residualsCm: Object.fromEntries(joints.map(([j, r]) => [j, Math.round(r.residual * CM_PER_M * 10) / 10])),
    ambiguous: joints.filter(([, r]) => r.ambiguous).map(([j]) => j),
    unreachable: joints.filter(([, r]) => r.unreachable).map(([j]) => j),
    ...extra,
  }
  return { settings: { ...solve.settings, pose }, confidence, baked: false }
}

/** The solve record re-scored for a new pose (after a depth nudge); unchanged before any pose solve. */
function rescored(st: Store, pose: PoseState): SketchMeta['solve'] {
  const rec = poseRecord(st.sketch)
  if (!rec) return st.sketch.solve
  const report = scorePose(rigOf(st.body), pose, st.camera, frameLandmarks(st.sketch, st.scene.canvasRatio), {
    ambiguous: jointList(rec['ambiguous']),
    unreachable: jointList(rec['unreachable']),
  })
  return withReport(st.sketch.solve, rec, report)
}

/** The pose a depth nudge would give, without changing anything (the ghost preview); null when it is refused. */
export function previewNudge(s: Pick<Store, 'pose' | 'body' | 'camera'>, joint: NudgeJoint, delta: number): PoseState | null {
  const locked = lockedJoints(s.pose)
  if (nudgeBlocked(locked, joint)) return null
  const before = s.pose.depthNudges[joint] ?? 0
  const asked = clamp(before + delta, -MAX_NUDGE_M, MAX_NUDGE_M) - before
  const r = nudgeDepth({ rig: rigOf(s.body), joints: s.pose.joints, root: s.pose.rootTransform, camera: s.camera, joint, delta: asked, locked })
  return { ...s.pose, joints: r.joints }
}

/** Depth hints of known landmark ids. */
const knownHints = (sketch: SketchMeta): Partial<Record<LandmarkId, DepthHint>> =>
  Object.fromEntries(Object.entries(sketch.depthHints).filter(([k]) => isLandmarkId(k)))

export const createSketchSlice: StateCreator<Store, [], [], SketchSlice> = (set, get) => {
  const editSketch = (label: string, fn: (s: SketchMeta) => SketchMeta, opts?: { preview?: boolean }): void =>
    get().edit(label, (st) => ({ sketch: fn(st.sketch) }), opts)

  return {
    sketch: defaultSketch(),

    importSketch: (image, path) => {
      get().cacheSketchImage(image)
      get().setCueTool('none')
      get().setSketchMessage(null)
      get().edit('Import sketch', () => ({ sketch: { ...defaultSketch(), hash: image.hash, path, size: { width: image.width, height: image.height } } }))
    },

    removeSketch: () => {
      get().setCueTool('none')
      get().setSketchMessage(null)
      get().edit('Remove sketch', () => ({ sketch: defaultSketch() }))
    },

    setSketchAlignment: (a, opts) => {
      if (get().sketchView.locked || get().sketchView.traceLock) return
      editSketch(
        'Move sketch',
        (s) => ({
          ...s,
          alignment: {
            ...s.alignment,
            ...a,
            scale: clamp(a.scale ?? s.alignment.scale, MIN_SKETCH_SCALE, MAX_SKETCH_SCALE),
          },
          solve: clearSolve(s),
        }),
        opts,
      )
    },

    resetSketchAlignment: () => {
      if (get().sketchView.locked || get().sketchView.traceLock) return
      editSketch('Reset sketch placement', (s) => ({ ...s, alignment: defaultSketch().alignment, solve: clearSolve(s) }))
    },

    setHorizon: (h, opts) => editSketch('Place horizon', (s) => ({ ...s, horizon: h, solve: clearSolve(s) }), opts),

    setHorizonPoint: (index, p, opts) =>
      editSketch(
        'Move horizon point',
        (s) => {
          if (!s.horizon) return s
          const h: [Vec2, Vec2] = index === 0 ? [p, s.horizon[1]] : [s.horizon[0], p]
          return { ...s, horizon: h, solve: clearSolve(s) }
        },
        opts,
      ),

    addVp: (p) =>
      editSketch('Add vanishing point', (s) => (s.vps.length >= MAX_VPS ? s : { ...s, vps: [...s.vps, p], solve: clearSolve(s) })),

    moveVp: (index, p, opts) =>
      editSketch(
        'Move vanishing point',
        (s) => (index < 0 || index >= s.vps.length ? s : { ...s, vps: s.vps.map((v, i) => (i === index ? p : v)), solve: clearSolve(s) }),
        opts,
      ),

    removeVp: (index) => editSketch('Remove vanishing point', (s) => ({ ...s, vps: s.vps.filter((_, i) => i !== index), solve: clearSolve(s) })),

    clearCues: () => {
      get().setCueDraft(null)
      editSketch('Clear perspective cues', (s) => ({ ...s, horizon: null, vps: [], solve: clearSolve(s) }))
    },

    solveCameraFromSketch: () => {
      const s = get()
      const result = solveFromSketch(s.sketch, s.camera, s.scene.canvasRatio)
      if (!result.ok) {
        get().setSketchMessage(result.reason)
        return result
      }
      get().setSketchMessage(null)
      const sol = result.solution
      // One command covers camera and solve record, so a single undo restores the previous camera exactly.
      get().edit('Solve camera from sketch', (st) => ({
        camera: applySolution(st.camera, sol),
        sketch: {
          ...st.sketch,
          solve: { settings: solveSettings(sol), confidence: { camera: sol.confidence }, baked: false },
        },
      }), { solve: true })
      return result
    },

    setLandmark: (id, p, opts) =>
      editSketch(`Place ${LANDMARKS[id].label}`, (s) => ({ ...s, landmarks: { ...s.landmarks, [id]: p }, solve: clearPoseSolve(s) }), opts),

    removeLandmark: (id) =>
      editSketch(`Remove ${LANDMARKS[id].label}`, (s) => {
        if (s.landmarks[id] === undefined && s.depthHints[id] === undefined) return s
        const { [id]: _p, ...landmarks } = s.landmarks
        const { [id]: _h, ...depthHints } = s.depthHints
        return { ...s, landmarks, depthHints, solve: clearPoseSolve(s) }
      }),

    clearLandmarks: () => {
      get().setActiveLandmark(null)
      editSketch('Clear landmarks', (s) => ({ ...s, landmarks: {}, depthHints: {}, solve: clearPoseSolve(s) }))
    },

    setDepthHint: (id, hint) =>
      editSketch(`Depth hint ${LANDMARKS[id].label}`, (s) => {
        const { [id]: _h, ...rest } = s.depthHints
        return { ...s, depthHints: hint ? { ...rest, [id]: hint } : rest, solve: clearPoseSolve(s) }
      }),

    solvePoseFromSketch: () => {
      const s = get()
      if (!s.sketch.size) {
        const fail = { ok: false as const, reason: 'Import a sketch first.' }
        get().setSketchMessage(fail.reason)
        return fail
      }
      // The camera first, from the cues, when they have not been solved since they last changed.
      let camera = s.camera
      let cameraSolution: CameraSolution | null = null
      const hasCues = s.sketch.horizon !== null || s.sketch.vps.length > 0
      if (hasCues && s.sketch.solve.confidence['camera'] === undefined) {
        const cr = solveFromSketch(s.sketch, s.camera, s.scene.canvasRatio)
        if (cr.ok) {
          cameraSolution = cr.solution
          camera = applySolution(camera, cr.solution)
        }
      }
      const prevFocalSolved = s.sketch.solve.confidence['camera'] !== undefined && s.sketch.solve.settings['focalSolved'] === true
      const lensFixed = cameraSolution ? cameraSolution.focalSolved : prevFocalSolved
      const rig = rigOf(s.body)
      const result = solvePose({
        rig,
        camera,
        landmarks: frameLandmarks(s.sketch, s.scene.canvasRatio),
        hints: knownHints(s.sketch),
        current: s.pose,
        locked: lockedJoints(s.pose),
        feetOnGround: s.feetOnGround,
        // Without a lens fixed by two orthogonal VPs, the focal length is found from the figure as well.
        solveFocal: !lensFixed,
      })
      if (!result.ok) {
        get().setSketchMessage(result.reason)
        return result
      }
      const sol = result.solution
      get().setSketchMessage(s.body.stylizedOverride?.acknowledged ? 'The stylized override is not part of the solve; it was solved on the unscaled body.' : null)
      get().edit('Solve pose from sketch', (st) => {
        const prev = st.sketch.solve
        const settings = cameraSolution ? solveSettings(cameraSolution) : { ...prev.settings }
        const cameraConf = cameraSolution ? cameraSolution.confidence : prev.confidence['camera']
        const confidence: Record<string, ConfidenceLevel> = cameraConf ? { camera: cameraConf } : {}
        for (const [j, r] of Object.entries(sol.joints)) if (r) confidence[j] = r.confidence
        for (const [l, c] of Object.entries(sol.limbs)) if (c) confidence[l] = c
        return {
          pose: sol.pose,
          camera: sol.camera,
          sketch: { ...st.sketch, solve: { settings: { ...settings, pose: poseSolveRecord(sol, cameraSolution !== null) }, confidence, baked: false } },
        }
      }, { solve: true })
      const after = get()
      after.setPoseWarnings(poseWarnings(rig, after.pose, stylizeOf(after.body)))
      return result
    },

    resolvePart: (part) => {
      const s = get()
      const rec = poseRecord(s.sketch)
      const fail = (reason: string): PoseSolveResult => {
        get().setSketchMessage(reason)
        return { ok: false, reason }
      }
      if (!s.sketch.size || !rec) return fail('Solve the whole pose first; a re-solve refines one part of it.')
      const rig = rigOf(s.body)
      const landmarks = frameLandmarks(s.sketch, s.scene.canvasRatio)
      const result = resolvePart(
        { rig, camera: s.camera, landmarks, hints: knownHints(s.sketch), current: s.pose, locked: lockedJoints(s.pose), feetOnGround: s.feetOnGround },
        part,
      )
      if (!result.ok) return fail(result.reason)
      get().setSketchMessage(null)
      const sol = result.solution
      // Flags of joints outside the part come from the last solve; inside it, from this one.
      const inPart = new Set<JointName>(PART_JOINTS[part])
      const flags = (key: 'ambiguous' | 'unreachable'): Set<JointName> => {
        const out = new Set([...jointList(rec[key])].filter((j) => !inPart.has(j)))
        for (const [j, r] of Object.entries(sol.joints) as [JointName, JointReport | undefined][]) if (r?.[key] && inPart.has(j)) out.add(j)
        return out
      }
      const report = scorePose(rig, sol.pose, s.camera, landmarks, { ambiguous: flags('ambiguous'), unreachable: flags('unreachable') })
      const resolvedParts = [...new Set([...(Array.isArray(rec['resolvedParts']) ? rec['resolvedParts'] : []), part])]
      get().edit(
        `Re-solve ${PART_LABEL[part]}`,
        (st) => ({ pose: sol.pose, sketch: { ...st.sketch, solve: withReport(st.sketch.solve, rec, report, { resolvedParts }) } }),
        { solve: true },
      )
      const after = get()
      after.setPoseWarnings(poseWarnings(rig, after.pose, stylizeOf(after.body)))
      return result
    },

    nudgeJointDepth: (joint, delta, opts) => {
      const s = get()
      const locked = lockedJoints(s.pose)
      if (nudgeBlocked(locked, joint)) return 0
      const before = s.pose.depthNudges[joint] ?? 0
      const asked = clamp(before + delta, -MAX_NUDGE_M, MAX_NUDGE_M) - before
      const r = nudgeDepth({ rig: rigOf(s.body), joints: s.pose.joints, root: s.pose.rootTransform, camera: s.camera, joint, delta: asked, locked })
      if (Math.abs(r.moved) < MIN_NUDGE_MOVE_M) return 0
      get().edit(
        `Depth nudge ${joint}`,
        (st) => {
          const pose: PoseState = { ...st.pose, joints: r.joints, depthNudges: { ...st.pose.depthNudges, [joint]: before + r.moved } }
          return { pose, sketch: { ...st.sketch, solve: rescored(st, pose) } }
        },
        opts,
      )
      return r.moved
    },

    clearDepthNudge: (joint) => {
      const s = get()
      const d = s.pose.depthNudges[joint]
      if (d === undefined) return
      const locked = lockedJoints(s.pose)
      const joints = nudgeBlocked(locked, joint)
        ? s.pose.joints
        : nudgeDepth({ rig: rigOf(s.body), joints: s.pose.joints, root: s.pose.rootTransform, camera: s.camera, joint, delta: -d, locked }).joints
      get().edit(`Clear depth nudge ${joint}`, (st) => {
        const { [joint]: _d, ...depthNudges } = st.pose.depthNudges
        const pose: PoseState = { ...st.pose, joints, depthNudges }
        return { pose, sketch: { ...st.sketch, solve: rescored(st, pose) } }
      })
    },

    bakeSolve: () => {
      get().endGesture()
      const s = get()
      const past = s.history.past
      let last = -1
      past.forEach((c, i) => {
        if (c.solve) last = i
      })
      const solved = Object.keys(s.sketch.solve.settings).length > 0 || Object.keys(s.sketch.solve.confidence).length > 0
      if (last < 0 && !solved) return false
      const baked: SketchMeta['solve'] = { settings: {}, confidence: {}, baked: true }
      const bakeDoc = (d: Doc): Doc => ({ ...d, pose: { ...d.pose, depthNudges: {} }, sketch: { ...d.sketch, solve: baked } })
      // History steps hold whole documents, so stepping back past the solve would bring it back: the steps up to
      // the last solve go, and the later ones are rewritten to the baked record.
      const kept = past
        .slice(last + 1)
        .map((c) => ({ ...c, before: bakeDoc(c.before), after: bakeDoc(c.after) }))
        .filter((c) => !sameDoc(c.before, c.after))
      set({
        pose: { ...s.pose, depthNudges: {} },
        sketch: { ...s.sketch, solve: baked },
        history: { past: kept, future: [], gesture: null },
        nudgeGhost: null,
      })
      return true
    },
  }
}
