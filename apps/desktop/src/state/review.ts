// "Next uncertain joint": the joints of the last pose solve worth a second look, worst first.
import { JOINT_NAMES, type ConfidenceLevel, type JointName, type SketchMeta } from '../types/scene'

export interface UncertainJoint {
  joint: JointName
  /** Null when the joint is flagged only as ambiguous. */
  confidence: ConfidenceLevel
  residualCm: number | null
  ambiguous: boolean
}

const SEVERITY: Record<ConfidenceLevel, number> = { red: 2, yellow: 1, green: 0 }

const poseRecord = (sketch: SketchMeta): Record<string, unknown> => {
  const p = sketch.solve.settings['pose']
  return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {}
}

/** Yellow and red joints, then green ones whose depth was ambiguous; worst residual first within each. */
export function uncertainJoints(sketch: SketchMeta): UncertainJoint[] {
  const rec = poseRecord(sketch)
  const ambiguous = new Set(Array.isArray(rec['ambiguous']) ? rec['ambiguous'].filter((j): j is string => typeof j === 'string') : [])
  const residuals = typeof rec['residualsCm'] === 'object' && rec['residualsCm'] !== null ? (rec['residualsCm'] as Record<string, unknown>) : {}
  const out: UncertainJoint[] = []
  for (const j of JOINT_NAMES) {
    const c = sketch.solve.confidence[j]
    if (!c) continue
    if (c === 'green' && !ambiguous.has(j)) continue
    const r = residuals[j]
    out.push({ joint: j, confidence: c, residualCm: typeof r === 'number' ? r : null, ambiguous: ambiguous.has(j) })
  }
  return out.sort((a, b) => SEVERITY[b.confidence] - SEVERITY[a.confidence] || (b.residualCm ?? 0) - (a.residualCm ?? 0))
}

/** The entry after `current` in the list, wrapping; the first when `current` is not in it. */
export function nextUncertain(list: readonly UncertainJoint[], current: JointName | null): UncertainJoint | null {
  if (list.length === 0) return null
  const i = list.findIndex((u) => u.joint === current)
  return list[(i + 1) % list.length] ?? null
}
