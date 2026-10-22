// Depth resolve (docs/solver-spec.md §4): where along its camera ray does a joint sit, given the parent
// joint's 3D position and the bone length L between them?
//
// The spec describes a 1D search over the ray in the window [parent − L, parent + L]. The cost
// |dist(point, parent) − L| has a closed-form minimiser, used here instead of sampling:
//   tc = d · (P − O) is the ray parameter closest to the parent, m the miss distance there.
//   m ≤ L  → two exact solutions t = tc ± sqrt(L² − m²) (nearer = 'toward' the viewer), residual 0.
//   m > L  → the ray passes outside the bone's reach; the best point is t = tc with residual m − L.
// The occlusion hint picks between the two exact solutions; without one the caller decides (both are
// returned) and the result is flagged ambiguous when they are meaningfully apart.
import type { Vector3 } from 'three'
import type { DepthHint } from './landmarks'
import { pointOnRay, type Ray } from './projection'

/** Two depth solutions closer than this (m) are effectively the same point, so not ambiguous. */
export const AMBIGUOUS_DEPTH_GAP_M = 0.03

/** solver-spec §4 confidence: green if residual < 2 cm, yellow < 8 cm, red otherwise. */
export const GREEN_RESIDUAL_M = 0.02
export const YELLOW_RESIDUAL_M = 0.08

export type Confidence = 'green' | 'yellow' | 'red'

export function confidenceFromResidual(residual: number): Confidence {
  if (residual < GREEN_RESIDUAL_M) return 'green'
  if (residual < YELLOW_RESIDUAL_M) return 'yellow'
  return 'red'
}

export interface DepthCandidate {
  point: Vector3
  /** Ray parameter (m from the camera). */
  t: number
  /** | |point − parent| − L |, m. */
  residual: number
}

export interface DepthResolve {
  /** One candidate when the ray misses the bone's reach (or grazes it), two otherwise: [toward, away]. */
  candidates: DepthCandidate[]
  /** Two exact solutions further apart than AMBIGUOUS_DEPTH_GAP_M. */
  ambiguous: boolean
}

export function resolveDepth(ray: Ray, parent: Vector3, length: number): DepthResolve {
  const tc = parent.clone().sub(ray.origin).dot(ray.dir)
  const closest = pointOnRay(ray, tc)
  const m = closest.distanceTo(parent)
  if (m >= length) {
    return { candidates: [{ point: closest, t: tc, residual: m - length }], ambiguous: false }
  }
  const s = Math.sqrt(length * length - m * m)
  const near = tc - s
  const far = tc + s
  // A solution behind the camera is not a solution.
  const ts = [near, far].filter((t) => t > 0)
  if (ts.length === 0) return { candidates: [{ point: closest, t: tc, residual: m - length }], ambiguous: false }
  const candidates = ts.map((t) => ({ point: pointOnRay(ray, t), t, residual: 0 }))
  return { candidates, ambiguous: candidates.length === 2 && 2 * s > AMBIGUOUS_DEPTH_GAP_M }
}

/** Applies an occlusion hint: 'toward' takes the nearer solution, 'away' the farther. */
export function pickByHint(r: DepthResolve, hint: DepthHint | undefined): DepthCandidate | null {
  if (r.candidates.length === 1) return r.candidates[0] ?? null
  if (!hint) return null
  return (hint === 'toward' ? r.candidates[0] : r.candidates[r.candidates.length - 1]) ?? null
}
