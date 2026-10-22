import type { StateCreator } from 'zustand'
import { retargetPose } from '../solve/retarget'
import type { BodyState, Vec3 } from '../types/scene'
import {
  ASYMMETRY_SPECS,
  BODY_GROUPS,
  compactAsymmetry,
  isSliderLocked,
  mergeUnlocked,
  NEUTRAL_SLIDERS,
  slidersInGroup,
  type BodyGroup,
} from './bodySliders'
import { defaultBody } from './defaults'
import { blendSliders, getPreset } from './presets'
import { rigOf, stylizeOf } from './rigOf'
import type { BodySlice, EditOpts, Store } from './types'

/** 4x4 column-major scale matrix. */
export const scaleMatrix = (s: Vec3): number[] => [s[0], 0, 0, 0, 0, s[1], 0, 0, 0, 0, s[2], 0, 0, 0, 0, 1]
export const IDENTITY_SCALE: Vec3 = [1, 1, 1]

/** Diagonal of a stylize matrix (column-major), for the UI. */
export const matrixScale = (m: readonly number[]): Vec3 => [m[0] ?? 1, m[5] ?? 1, m[10] ?? 1]

const sameSliders = (a: BodyState['sliders'], b: BodyState['sliders']): boolean =>
  Object.keys(a).every((k) => a[k as keyof typeof a] === b[k as keyof typeof b])

export const createBodySlice: StateCreator<Store, [], [], BodySlice> = (_set, get) => {
  /** Every body change retargets the pose onto the new body (rotations kept, feet kept on the ground). */
  const bodyEdit = (label: string, next: (s: Store) => BodyState | null, opts?: EditOpts): void => {
    const out: { warnings?: string[] } = {}
    get().edit(
      label,
      (s) => {
        const body = next(s)
        if (!body) return {}
        const r = retargetPose(s.pose, rigOf(s.body), rigOf(body), { from: stylizeOf(s.body), to: stylizeOf(body) })
        out.warnings = r.warnings
        return { body, pose: r.pose }
      },
      opts,
    )
    if (out.warnings) get().setPoseWarnings(out.warnings)
  }

  const presetSliders = (s: Store) => getPreset(s.body.presetId, s.customPresets)?.sliders ?? NEUTRAL_SLIDERS

  return {
    body: defaultBody(),

    applyPreset: (presetId) => {
      const preset = getPreset(presetId, get().customPresets)
      if (!preset) return
      bodyEdit(`Preset ${preset.name}`, (s) => {
        const sliders = mergeUnlocked(s.body.sliders, preset.sliders, s.body.locks)
        return {
          ...s.body,
          presetId: preset.id,
          modifiedFrom: sameSliders(sliders, preset.sliders) ? (preset.modifiedFrom ?? null) : preset.id,
          sliders,
        }
      })
    },

    setBodySlider: (key, value, opts) =>
      bodyEdit(
        `Body ${key}`,
        (s) =>
          isSliderLocked(s.body.locks, key)
            ? null
            : { ...s.body, modifiedFrom: s.body.presetId, sliders: { ...s.body.sliders, [key]: value } },
        opts,
      ),

    blendPresets: (aId, bId, t, opts) => {
      const custom = get().customPresets
      const a = getPreset(aId, custom)
      const b = getPreset(bId, custom)
      if (!a || !b) return
      bodyEdit(
        `Blend ${a.name} → ${b.name}`,
        (s) => ({
          ...s.body,
          presetId: a.id,
          modifiedFrom: a.id,
          sliders: mergeUnlocked(s.body.sliders, blendSliders(a.sliders, b.sliders, t), s.body.locks),
        }),
        opts,
      )
    },

    toggleBodyLock: (lockKey) =>
      get().edit(`Toggle lock ${lockKey}`, (s) => {
        const locks = { ...s.body.locks }
        if (locks[lockKey]) delete locks[lockKey]
        else locks[lockKey] = true
        return { body: { ...s.body, locks } }
      }),

    resetBodyGroup: (group: BodyGroup) =>
      bodyEdit(`Reset ${group}`, (s) => {
        const base = presetSliders(s)
        const next = Object.fromEntries(slidersInGroup(group).map((k) => [k, base[k]]))
        const sliders = mergeUnlocked(s.body.sliders, next, s.body.locks)
        return { ...s.body, sliders, modifiedFrom: sameSliders(sliders, base) ? null : s.body.presetId }
      }),

    resetBody: () =>
      bodyEdit('Reset body', (s) => {
        const base = presetSliders(s)
        const next = Object.fromEntries(BODY_GROUPS.flatMap(slidersInGroup).map((k) => [k, base[k]]))
        const sliders = mergeUnlocked(s.body.sliders, next, s.body.locks)
        return { ...s.body, sliders, modifiedFrom: sameSliders(sliders, base) ? null : s.body.presetId }
      }),

    setAsymmetry: (key, value, symmetric, opts) =>
      bodyEdit(
        `Asymmetry ${key}`,
        (s) => {
          const asym = { ...s.body.asymmetry, [key]: value }
          if (symmetric) asym[ASYMMETRY_SPECS[key].mirror] = value
          return { ...s.body, modifiedFrom: s.body.presetId, asymmetry: compactAsymmetry(asym) }
        },
        opts,
      ),

    resetAsymmetry: () => bodyEdit('Reset asymmetry', (s) => ({ ...s.body, asymmetry: {} })),

    setStylizedScale: (scale, opts) =>
      bodyEdit(
        scale ? 'Stylized scale' : 'Remove stylized override',
        (s) => ({
          ...s.body,
          stylizedOverride: scale ? { matrix: scaleMatrix(scale), acknowledged: s.body.stylizedOverride?.acknowledged ?? false } : null,
        }),
        opts,
      ),

    acknowledgeStylized: (acknowledged) =>
      bodyEdit(acknowledged ? 'Acknowledge stylized override' : 'Suspend stylized override', (s) => ({
        ...s.body,
        stylizedOverride: { matrix: s.body.stylizedOverride?.matrix ?? scaleMatrix(IDENTITY_SCALE), acknowledged },
      })),
  }
}
