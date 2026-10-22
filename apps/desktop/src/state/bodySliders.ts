// Body slider taxonomy: groups, ranges and neutral values. Neutral = "Realistic Average" rest geometry.
import { ASYMMETRY_KEYS, BODY_SLIDER_KEYS, type AsymmetryKey, type BodySliderKey, type BodySliders } from '../types/scene'

export const BODY_GROUPS = ['proportions', 'limbs', 'shape', 'advanced'] as const
export type BodyGroup = (typeof BODY_GROUPS)[number]

export const BODY_GROUP_LABELS: Record<BodyGroup, string> = {
  proportions: 'Proportions',
  limbs: 'Limbs',
  shape: 'Shape / Depth',
  advanced: 'Advanced',
}

export interface SliderSpec {
  label: string
  group: BodyGroup
  min: number
  max: number
  step: number
  /** Value at which the rest skeleton in bodyRig.ts is authored. */
  neutral: number
  unit?: string
  decimals?: number
}

/** Ranges cover every seed preset with headroom. Multipliers are 1 at neutral. */
export const BODY_SLIDER_SPECS: Record<BodySliderKey, SliderSpec> = {
  height: { label: 'Height', group: 'proportions', min: 0.8, max: 2.3, step: 0.01, neutral: 1.75, unit: 'm' },
  headScale: { label: 'Head size', group: 'proportions', min: 0.7, max: 2.6, step: 0.01, neutral: 1 },
  torsoLength: { label: 'Torso length', group: 'proportions', min: 0.75, max: 1.3, step: 0.01, neutral: 1 },
  legLength: { label: 'Leg length', group: 'proportions', min: 0.6, max: 1.35, step: 0.01, neutral: 1 },
  armLength: { label: 'Arm length', group: 'proportions', min: 0.7, max: 1.3, step: 0.01, neutral: 1 },
  shoulderHipRatio: { label: 'Shoulder : hip', group: 'proportions', min: 0.85, max: 1.7, step: 0.01, neutral: 1.15 },

  forearmRatio: { label: 'Forearm : upper arm', group: 'limbs', min: 0.8, max: 1.25, step: 0.01, neutral: 1 },
  shinRatio: { label: 'Shin : thigh', group: 'limbs', min: 0.8, max: 1.25, step: 0.01, neutral: 1 },
  handSize: { label: 'Hand size', group: 'limbs', min: 0.7, max: 1.5, step: 0.01, neutral: 1 },
  footSize: { label: 'Foot size', group: 'limbs', min: 0.7, max: 1.5, step: 0.01, neutral: 1 },
  limbThickness: { label: 'Limb thickness', group: 'limbs', min: 0.6, max: 1.6, step: 0.01, neutral: 1 },

  mass: { label: 'Mass', group: 'shape', min: 0, max: 1, step: 0.01, neutral: 0.5 },
  muscle: { label: 'Muscle', group: 'shape', min: 0, max: 1, step: 0.01, neutral: 0.4 },
  softness: { label: 'Softness', group: 'shape', min: 0, max: 1, step: 0.01, neutral: 0.4 },
  chestDepth: { label: 'Chest depth', group: 'shape', min: 0.7, max: 1.4, step: 0.01, neutral: 1 },
  waist: { label: 'Waist', group: 'shape', min: 0.7, max: 1.6, step: 0.01, neutral: 1 },
  hipDepth: { label: 'Hip depth', group: 'shape', min: 0.7, max: 1.4, step: 0.01, neutral: 1 },

  neckLength: { label: 'Neck length', group: 'advanced', min: 0.4, max: 1.6, step: 0.01, neutral: 1 },
  neckThickness: { label: 'Neck thickness', group: 'advanced', min: 0.7, max: 1.5, step: 0.01, neutral: 1 },
  shoulderSlope: { label: 'Shoulder height', group: 'advanced', min: -0.04, max: 0.04, step: 0.001, neutral: 0, unit: 'm', decimals: 3 },
  jointSize: { label: 'Joint marker size', group: 'advanced', min: 0.5, max: 1.5, step: 0.01, neutral: 1 },
}

export const NEUTRAL_SLIDERS: BodySliders = Object.fromEntries(
  BODY_SLIDER_KEYS.map((k) => [k, BODY_SLIDER_SPECS[k].neutral]),
) as BodySliders

export const slidersInGroup = (g: BodyGroup): BodySliderKey[] => BODY_SLIDER_KEYS.filter((k) => BODY_SLIDER_SPECS[k].group === g)

export const groupLockKey = (g: BodyGroup): string => `group:${g}`

/** A slider is locked by its own lock or by its group's lock. */
export function isSliderLocked(locks: Record<string, boolean>, key: BodySliderKey): boolean {
  return Boolean(locks[key] || locks[groupLockKey(BODY_SLIDER_SPECS[key].group)])
}

/** Copies `next` over `current`, keeping every locked slider at its current value. */
export function mergeUnlocked(current: BodySliders, next: Partial<BodySliders>, locks: Record<string, boolean>): BodySliders {
  const out = { ...current }
  for (const k of BODY_SLIDER_KEYS) {
    const v = next[k]
    if (v !== undefined && !isSliderLocked(locks, k)) out[k] = v
  }
  return out
}

// ---- Asymmetry ----

export interface AsymmetrySpec {
  label: string
  min: number
  max: number
  step: number
  neutral: number
  unit?: string
  decimals?: number
  /** The same control on the other side, for the symmetry toggle. */
  mirror: AsymmetryKey
}

/** Height ranges stay small: past ~3 cm a hip offset lifts one foot off the ground (retarget warns). */
export const ASYMMETRY_SPECS: Record<AsymmetryKey, AsymmetrySpec> = {
  leftArmThickness: { label: 'L arm thickness', min: 0.7, max: 1.4, step: 0.01, neutral: 1, mirror: 'rightArmThickness' },
  rightArmThickness: { label: 'R arm thickness', min: 0.7, max: 1.4, step: 0.01, neutral: 1, mirror: 'leftArmThickness' },
  leftLegThickness: { label: 'L leg thickness', min: 0.7, max: 1.4, step: 0.01, neutral: 1, mirror: 'rightLegThickness' },
  rightLegThickness: { label: 'R leg thickness', min: 0.7, max: 1.4, step: 0.01, neutral: 1, mirror: 'leftLegThickness' },
  leftShoulderHeight: { label: 'L shoulder height', min: -0.04, max: 0.04, step: 0.001, neutral: 0, unit: 'm', decimals: 3, mirror: 'rightShoulderHeight' },
  rightShoulderHeight: { label: 'R shoulder height', min: -0.04, max: 0.04, step: 0.001, neutral: 0, unit: 'm', decimals: 3, mirror: 'leftShoulderHeight' },
  leftHipHeight: { label: 'L hip height', min: -0.03, max: 0.03, step: 0.001, neutral: 0, unit: 'm', decimals: 3, mirror: 'rightHipHeight' },
  rightHipHeight: { label: 'R hip height', min: -0.03, max: 0.03, step: 0.001, neutral: 0, unit: 'm', decimals: 3, mirror: 'leftHipHeight' },
}

export const asymmetryValue = (asym: Record<string, number>, key: AsymmetryKey): number =>
  asym[key] ?? ASYMMETRY_SPECS[key].neutral

/** Drops keys at their neutral value so saved files only carry real differences. */
export function compactAsymmetry(asym: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of ASYMMETRY_KEYS) {
    const v = asym[k]
    if (v !== undefined && v !== ASYMMETRY_SPECS[k].neutral) out[k] = v
  }
  return out
}
