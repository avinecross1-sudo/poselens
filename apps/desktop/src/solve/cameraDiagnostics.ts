// Camera solve diagnostics (Phase 3C): what the last camera / pose solve says about the lens, how sure it is, and
// whether the shot camera and the solve still agree. Reads the solve record (sketch.solve) and the current camera;
// pure, no store.
import { controlsFromCamera } from '../lib/cameraMath'
import { degToRad, radToDeg } from '../lib/units'
import type { CameraState, ConfidenceLevel, SketchMeta } from '../types/scene'
import { SUGGESTED_FOCAL_RANGE_MM } from './cameraSolve'

/** The camera has been tilted or rolled away from the solve by more than this (rad): the sketch no longer lines up. */
export const ANGLE_DRIFT_RAD = degToRad(1)
/** The focal length has moved from the solved one by more than this fraction. */
export const FOCAL_DRIFT_RATIO = 0.02
/** A lens found from the figure may sit this fraction outside the range the cues allow before it is flagged. */
export const FIGURE_LENS_SLACK = 0.1
/** This many red joints after a pose solve suggest the camera (or the landmarks) are inconsistent with the drawing. */
export const RED_JOINTS_WARN = 3
/** Joints further than this (cm) off their landmark ray are red (solver-spec §4). */
const RED_RESIDUAL_CM = 8

export type FocalSource = 'vps' | 'figure' | 'suggested'

export interface CameraDiagnostics {
  /** Worst of the solve's own confidence and the consistency checks; null when nothing was solved. */
  confidence: ConfidenceLevel | null
  /** Focal length the solve settled on (mm). */
  focalMm: number | null
  /** The focal range consistent with the cues (two VPs), or the suggested range when the cues cannot fix it. */
  focalRangeMm: [number, number] | null
  focalSource: FocalSource | null
  /** Pitch and roll of the camera solve (rad), when there was one. */
  pitch: number | null
  roll: number | null
  /** Warnings from the camera solve itself (cue inconsistencies), as recorded. */
  cueWarnings: string[]
  /** Checks of the current camera and pose solve against the camera solve. */
  consistency: string[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const pair = (v: unknown): [number, number] | null => {
  if (!Array.isArray(v) || v.length !== 2) return null
  const a = num(v[0])
  const b = num(v[1])
  return a !== null && b !== null ? [Math.min(a, b), Math.max(a, b)] : null
}
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

const ORDER: readonly ConfidenceLevel[] = ['green', 'yellow', 'red']
const worse = (a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a)
/** Signed angle difference wrapped to (−π, π]. */
const angleDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const mm = (v: number): string => `${Math.round(v)} mm`
const deg = (v: number): string => `${radToDeg(v).toFixed(1)}°`

export function cameraDiagnostics(sketch: SketchMeta, camera: CameraState): CameraDiagnostics {
  const st = sketch.solve.settings
  const cameraConf = sketch.solve.confidence['camera'] ?? null
  const pose = record(st['pose'])
  const hasPose = Object.keys(pose).length > 0
  const out: CameraDiagnostics = {
    confidence: null,
    focalMm: null,
    focalRangeMm: null,
    focalSource: null,
    pitch: null,
    roll: null,
    cueWarnings: [],
    consistency: [],
  }
  if (cameraConf === null && !hasPose) return out

  let conf: ConfidenceLevel = cameraConf ?? 'green'
  const flag = (msg: string, level: ConfidenceLevel = 'yellow'): void => {
    out.consistency.push(msg)
    conf = worse(conf, level)
  }

  // ---- The camera solve from the cues ----
  const solvedFocal = num(st['focalMm'])
  const cueRange = pair(st['focalRangeMm'])
  const vpsFixFocal = cameraConf !== null && st['focalSolved'] === true
  if (cameraConf !== null) {
    out.pitch = num(st['pitch'])
    out.roll = num(st['roll'])
    out.cueWarnings = strings(st['warnings'])
  }

  // ---- The lens: from two VPs, else from the figure, else only a suggested range ----
  const figureFocal = hasPose && pose['focalSolved'] === true ? num(pose['focalMm']) : null
  if (vpsFixFocal && solvedFocal !== null) {
    out.focalSource = 'vps'
    out.focalMm = solvedFocal
    out.focalRangeMm = cueRange ?? [solvedFocal, solvedFocal]
  } else if (figureFocal !== null) {
    out.focalSource = 'figure'
    out.focalMm = figureFocal
    out.focalRangeMm = cueRange ?? [...SUGGESTED_FOCAL_RANGE_MM]
  } else {
    out.focalSource = 'suggested'
    out.focalMm = solvedFocal ?? num(pose['focalMm'])
    out.focalRangeMm = cueRange ?? [...SUGGESTED_FOCAL_RANGE_MM]
  }

  // ---- Consistency of the current camera with the solve ----
  const range = out.focalRangeMm
  if (vpsFixFocal && range && (camera.focal < range[0] || camera.focal > range[1])) {
    flag(`The shot camera's focal length (${mm(camera.focal)}) is outside the range the vanishing points allow (${mm(range[0])}–${mm(range[1])}).`)
  } else if (out.focalMm !== null && Math.abs(camera.focal - out.focalMm) > FOCAL_DRIFT_RATIO * out.focalMm) {
    flag(`The focal length was changed after the solve (now ${mm(camera.focal)}, solved ${mm(out.focalMm)}).`)
  }
  if (out.pitch !== null) {
    const pitch = controlsFromCamera(camera.position, camera.target).pitch
    if (Math.abs(angleDiff(pitch, out.pitch)) > ANGLE_DRIFT_RAD) {
      flag(`The camera was tilted after the solve (pitch now ${deg(pitch)}, solved ${deg(out.pitch)}): the sketch no longer lines up with the horizon.`)
    }
  }
  if (out.roll !== null && Math.abs(angleDiff(camera.roll, out.roll)) > ANGLE_DRIFT_RAD) {
    flag(`The camera was rolled after the solve (now ${deg(camera.roll)}, solved ${deg(out.roll)}).`)
  }

  // ---- Consistency of the pose solve with the cues ----
  if (figureFocal !== null && cueRange && cameraConf !== null) {
    const [lo, hi] = cueRange
    if (figureFocal < lo * (1 - FIGURE_LENS_SLACK) || figureFocal > hi * (1 + FIGURE_LENS_SLACK)) {
      flag(`The lens found from the figure (${mm(figureFocal)}) disagrees with the cues (${mm(lo)}–${mm(hi)}). Check the vanishing points or the landmarks.`)
    }
  }
  if (hasPose) {
    const residuals = Object.values(record(pose['residualsCm'])).map(num).filter((r): r is number => r !== null)
    const red = residuals.filter((r) => r >= RED_RESIDUAL_CM).length
    if (red >= RED_JOINTS_WARN) {
      flag(`${red} joints are more than ${RED_RESIDUAL_CM} cm off the drawing: the camera, the lens or some landmarks may be inconsistent.`)
    }
  }
  if (!vpsFixFocal && figureFocal === null) {
    flag(`The lens is not fixed by the cues: place a horizon and two vanishing points, or keep a focal length within ${mm(out.focalRangeMm[0])}–${mm(out.focalRangeMm[1])}.`)
  }

  out.confidence = conf
  return out
}
