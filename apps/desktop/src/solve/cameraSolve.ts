// Camera solve from sketch perspective cues (docs/solver-spec.md §1). Pure math, no store.
//
// Frame space (see lib/sketchSpace.ts): origin = principal point = frame centre, +y up, unit = frame height.
// A pinhole camera looks down -Z; the image point (x, y) is the ray (x, y, -f) with f = focalMm / sensorHeightMm.
//
//  roll   Up leans toward +x on screen for positive roll (the same sense as CameraState.roll).
//         The horizon is the line  n . p = d  with n = (sin roll, cos roll), so  roll = -(horizon angle).
//  pitch  Positive = looking up (the sense of cameraMath.pitch). The horizon sits at d = -f tan(pitch)
//         from the frame centre along n.
//  focal  Two horizontal VPs belong to orthogonal directions, so (v1, -f) . (v2, -f) = 0 and
//         f^2 = -(v1 . v2). The spec's f = sqrt(d1 d2) is the special case where the frame centre
//         lies on the segment between the VPs; this form also holds with a tilted or offset horizon.
//
// VP order: vps[0], vps[1] = the two horizontal VPs; vps[2] = the vertical VP.
import { setPitch, MAX_PITCH_RAD } from '../lib/cameraMath'
import { imageToFrame } from '../lib/sketchSpace'
import { clamp, degToRad, MAX_FOCAL_MM, MIN_FOCAL_MM } from '../lib/units'
import type { CameraState, ConfidenceLevel, SketchMeta, Vec2 } from '../types/scene'

/** Focal lengths offered as a range when no orthogonal VP pair fixes it (mm). */
export const SUGGESTED_FOCAL_RANGE_MM: readonly [number, number] = [24, 135]
/** How far (frame heights) a VP is assumed to be misplaced; sets the width of the solved focal range. */
export const VP_PLACEMENT_ERROR = 0.01
/** A horizontal VP farther than this (frame heights) from the horizon line is inconsistent. */
export const HORIZON_VP_TOLERANCE = 0.05
/** Beyond this many times the tolerance a VP/horizon mismatch is red, not yellow. */
export const HORIZON_VP_RED_FACTOR = 3
/** Two VPs closer than this (frame heights) are treated as the same point. */
export const MIN_VP_SEPARATION = 1e-3
/** A near-vertical horizon (|cos| of its angle below this) has no meaningful roll. */
export const MIN_HORIZON_RUN = 1e-6
/** Horizon tilt beyond this is suspicious (rad). */
export const ROLL_WARN_RAD = degToRad(45)
/** Focal estimates from different VP pairs may differ by this ratio before a warning. */
export const FOCAL_AGREEMENT_RATIO = 1.25
/** The vertical VP must lie on the line through the frame centre normal to the horizon, within this angle. */
export const VERTICAL_VP_ANGLE_TOLERANCE_RAD = degToRad(8)
/** Allowed ratio between the placed vertical VP distance and the one implied by pitch and focal. */
export const VERTICAL_VP_DISTANCE_RATIO = 1.5
/** |horizon offset| below this (frame heights) counts as a level camera, whose vertical VP is at infinity. */
export const LEVEL_HORIZON_EPS = 1e-3
/** With a level camera a finite vertical VP closer than this (frame heights) is inconsistent. */
export const LEVEL_VERTICAL_VP_MIN_DISTANCE = 10

export interface SolveInput {
  /** Frame space. */
  horizon: [Vec2, Vec2] | null
  /** Frame space. */
  vps: Vec2[]
  sensorHeightMm: number
  /** Used as the focal estimate when the cues cannot fix it. */
  currentFocalMm: number
}

export interface CameraSolution {
  /** Radians, positive = looking up. */
  pitch: number
  /** Radians, CameraState.roll sense. */
  roll: number
  focalMm: number
  focalRangeMm: [number, number]
  /** Pitch (rad) at the ends of the focal range, ascending. */
  pitchRange: [number, number]
  /** True when two horizontal VPs fixed the focal length; false when it is a guess within the range. */
  focalSolved: boolean
  horizonSource: 'placed' | 'vps'
  confidence: ConfidenceLevel
  warnings: string[]
}

export type SolveResult = { ok: true; solution: CameraSolution } | { ok: false; reason: string }

interface Line {
  /** Unit direction, left to right. */
  t: Vec2
  /** Unit normal, rotated +90 degrees from t (the "up" side). */
  n: Vec2
  /** n . p for points on the line. */
  d: number
}

const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
const len = (a: Vec2): number => Math.hypot(a[0], a[1])
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1])

export function lineThrough(a: Vec2, b: Vec2): Line | null {
  const l = dist(a, b)
  if (l < MIN_VP_SEPARATION) return null
  let t: Vec2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
  if (t[0] < 0 || (t[0] === 0 && t[1] < 0)) t = [-t[0], -t[1]]
  const n: Vec2 = [-t[1], t[0]]
  return { t, n, d: dot(n, a) }
}

/** Orthogonal VPs give f^2 = -(v1 . v2) in frame-height units; null when that is not positive. */
export function focalFromVps(v1: Vec2, v2: Vec2): number | null {
  const f2 = -dot(v1, v2)
  return f2 > 0 ? Math.sqrt(f2) : null
}

/** Roll (rad) of a horizon line, in the CameraState.roll sense. */
export const rollFromHorizon = (h: Line): number => -Math.atan2(h.t[1], h.t[0])

/** Pitch (rad, + = up) for a horizon `offset` (frame heights along its up-normal, from the frame centre) at focal f. */
export const pitchFromHorizonOffset = (offset: number, f: number): number => Math.atan2(-offset, f)

const projectOnto = (p: Vec2, l: Line): Vec2 => {
  const k = dot(l.n, p) - l.d
  return [p[0] - k * l.n[0], p[1] - k * l.n[1]]
}

const angleBetween = (a: Vec2, b: Vec2): number => Math.acos(clamp(dot(a, b) / (len(a) * len(b)), -1, 1))

type Severity = 'yellow' | 'red'

export function solveCamera(input: SolveInput): SolveResult {
  const found: { sev: Severity; msg: string }[] = []
  const warn = (sev: Severity, msg: string): void => {
    found.push({ sev, msg })
  }
  const [v1, v2, v3] = input.vps
  const sensor = input.sensorHeightMm

  // ---- Horizon ----
  let horizon: Line | null = null
  let horizonSource: 'placed' | 'vps' = 'placed'
  if (input.horizon) {
    horizon = lineThrough(input.horizon[0], input.horizon[1])
    if (!horizon) return { ok: false, reason: 'The two horizon points are on top of each other.' }
  } else if (v1 && v2) {
    horizon = lineThrough(v1, v2)
    horizonSource = 'vps'
    if (!horizon) return { ok: false, reason: 'VP 1 and VP 2 are on top of each other.' }
    warn('yellow', 'No horizon placed: it was taken from the line through VP 1 and VP 2.')
  } else {
    return { ok: false, reason: 'Place a horizon line, or two horizontal vanishing points.' }
  }
  if (Math.abs(horizon.t[0]) < MIN_HORIZON_RUN) return { ok: false, reason: 'The horizon is vertical; move one of its points.' }
  const hz: Line = horizon
  const roll = rollFromHorizon(hz)
  if (Math.abs(roll) > ROLL_WARN_RAD) warn('yellow', `The horizon is tilted ${Math.abs(Math.round((roll * 180) / Math.PI))}°; check its points.`)

  // ---- VPs against the horizon ----
  const horizontal = [v1, v2].filter((v): v is Vec2 => v !== undefined)
  horizontal.forEach((v, i) => {
    const off = Math.abs(dot(hz.n, v) - hz.d)
    if (off > HORIZON_VP_TOLERANCE) {
      warn(
        off > HORIZON_VP_TOLERANCE * HORIZON_VP_RED_FACTOR ? 'red' : 'yellow',
        `VP ${i + 1} is ${(off * 100).toFixed(0)}% of the frame height off the horizon; the VPs and horizon disagree.`,
      )
    }
  })

  // ---- Focal length ----
  let f: number | null = null
  let fLo = 0
  let fHi = 0
  if (v1 && v2) {
    const p1 = projectOnto(v1, hz)
    const p2 = projectOnto(v2, hz)
    if (dist(p1, p2) < MIN_VP_SEPARATION) {
      warn('red', 'VP 1 and VP 2 are on top of each other, so they cannot give a focal length.')
    } else {
      f = focalFromVps(p1, p2)
      if (f === null) {
        warn('red', 'The frame centre is outside the two VPs, so they cannot be orthogonal directions. Check the VPs or move the sketch.')
      } else {
        // Widen to a range by nudging each VP along the horizon by the placement error.
        const e = VP_PLACEMENT_ERROR
        const shifts = [-e, e]
        const fs = shifts.flatMap((s1) =>
          shifts.map((s2) =>
            focalFromVps([p1[0] + hz.t[0] * s1, p1[1] + hz.t[1] * s1], [p2[0] + hz.t[0] * s2, p2[1] + hz.t[1] * s2]),
          ),
        )
        const valid = [f, ...fs.filter((x): x is number => x !== null)]
        fLo = Math.min(...valid)
        fHi = Math.max(...valid)
      }
    }
  }

  let focalMm: number
  let focalRangeMm: [number, number]
  const focalSolved = f !== null
  if (f !== null) {
    focalMm = f * sensor
    focalRangeMm = [fLo * sensor, fHi * sensor]
    if (focalMm < MIN_FOCAL_MM || focalMm > MAX_FOCAL_MM) {
      warn('red', `The VP spacing implies ${focalMm.toFixed(0)} mm, outside ${MIN_FOCAL_MM}–${MAX_FOCAL_MM} mm; it was clamped.`)
    }
  } else {
    focalRangeMm = [SUGGESTED_FOCAL_RANGE_MM[0], SUGGESTED_FOCAL_RANGE_MM[1]]
    focalMm = clamp(input.currentFocalMm, focalRangeMm[0], focalRangeMm[1])
    if (!(v1 && v2)) warn('yellow', 'Focal length is a suggested range: add a second horizontal VP to solve it.')
  }
  const fUnits = clamp(focalMm, MIN_FOCAL_MM, MAX_FOCAL_MM) / sensor

  // ---- Pitch ----
  const offset = hz.d // signed distance of the horizon from the frame centre along n
  const pitch = pitchFromHorizonOffset(offset, fUnits)
  const pitchAt = (mm: number): number => pitchFromHorizonOffset(offset, mm / sensor)
  const ends = [pitchAt(focalRangeMm[0]), pitchAt(focalRangeMm[1])]
  const pitchRange: [number, number] = [Math.min(...ends), Math.max(...ends)]
  if (Math.abs(pitch) > MAX_PITCH_RAD) warn('yellow', 'The pitch is steeper than the camera allows; it was limited.')

  // ---- Vertical VP (third VP) ----
  if (v3 && f !== null && len(v3) > MIN_VP_SEPARATION) {
    if (Math.abs(offset) < LEVEL_HORIZON_EPS) {
      if (len(v3) < LEVEL_VERTICAL_VP_MIN_DISTANCE) warn('yellow', 'The horizon is through the frame centre (no tilt), but the vertical VP is close. They disagree.')
    } else {
      const k = -(fUnits * fUnits) / offset
      const expected: Vec2 = [hz.n[0] * k, hz.n[1] * k]
      if (angleBetween(v3, expected) > VERTICAL_VP_ANGLE_TOLERANCE_RAD) {
        warn('yellow', 'The vertical VP is not on the line through the frame centre, square to the hz.')
      } else {
        const ratio = len(v3) / len(expected)
        if (ratio > VERTICAL_VP_DISTANCE_RATIO || ratio < 1 / VERTICAL_VP_DISTANCE_RATIO) {
          warn('yellow', 'The vertical VP distance does not match the pitch and focal length from the other cues.')
        }
      }
    }
    for (const [i, vh] of horizontal.entries()) {
      const f13 = focalFromVps(vh, v3)
      if (f13 === null || Math.max(f13, fUnits) / Math.min(f13, fUnits) > FOCAL_AGREEMENT_RATIO) {
        warn('yellow', `VP ${i + 1} and the vertical VP imply a different focal length than the horizontal pair.`)
      }
    }
  }

  const confidence: ConfidenceLevel = found.some((w) => w.sev === 'red')
    ? 'red'
    : found.length > 0 || !focalSolved
      ? 'yellow'
      : 'green'

  return {
    ok: true,
    solution: {
      pitch,
      roll,
      focalMm,
      focalRangeMm,
      pitchRange,
      focalSolved,
      horizonSource,
      confidence,
      warnings: found.map((w) => w.msg),
    },
  }
}

/** Reads the stored cues (image space) into frame space and solves. */
export function solveFromSketch(sketch: SketchMeta, camera: CameraState, frameAspect: number): SolveResult {
  if (!sketch.size) return { ok: false, reason: 'Import a sketch first.' }
  const imageAspect = sketch.size.width / sketch.size.height
  const toFrame = (p: Vec2): Vec2 => imageToFrame(p, sketch.alignment, imageAspect, frameAspect)
  return solveCamera({
    horizon: sketch.horizon ? [toFrame(sketch.horizon[0]), toFrame(sketch.horizon[1])] : null,
    vps: sketch.vps.map(toFrame),
    sensorHeightMm: camera.sensorHeight,
    currentFocalMm: camera.focal,
  })
}

/** An editable camera: position kept, view tilted to the solved pitch, roll and focal set. Nothing is locked. */
export function applySolution(camera: CameraState, sol: CameraSolution): CameraState {
  const placed = setPitch(camera.position, camera.target, clamp(sol.pitch, -MAX_PITCH_RAD, MAX_PITCH_RAD))
  return { ...camera, ...placed, roll: sol.roll, focal: clamp(sol.focalMm, MIN_FOCAL_MM, MAX_FOCAL_MM) }
}
