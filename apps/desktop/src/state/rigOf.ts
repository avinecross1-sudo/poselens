// Rig + stylize matrix for a body, memoised on the slider/asymmetry/override objects
// (state is immutable, so identity changes exactly when the body changes).
import type { Matrix4 } from 'three'
import { activeStylizeMatrix } from '../solve/fk'
import { computeRig, type Rig } from '../three/bodyRig'
import type { BodyState } from '../types/scene'

let lastKey: [BodyState['sliders'], BodyState['asymmetry']] | null = null
let lastRig: Rig | null = null

export function rigOf(body: BodyState): Rig {
  if (lastKey && lastRig && lastKey[0] === body.sliders && lastKey[1] === body.asymmetry) return lastRig
  lastRig = computeRig(body.sliders, body.asymmetry)
  lastKey = [body.sliders, body.asymmetry]
  return lastRig
}

export const stylizeOf = (body: BodyState): Matrix4 | null => activeStylizeMatrix(body.stylizedOverride)
