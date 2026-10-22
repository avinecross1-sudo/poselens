// Body presets come from /seeds/body-presets.json, bundled at build time (read-only).
// Seeds may list only some sliders; the rest take their neutral value.
import presetsJson from '@seeds/body-presets.json'
import type { BodySliders } from '../types/scene'
import { NEUTRAL_SLIDERS } from './bodySliders'

export interface BodyPreset {
  id: string
  name: string
  sliders: BodySliders
  /** Set on user-saved presets: the preset they were derived from. */
  modifiedFrom?: string
}

interface SeedPreset {
  id: string
  name: string
  sliders: Partial<BodySliders>
}

export const BODY_PRESETS: readonly BodyPreset[] = (presetsJson as { presets: SeedPreset[] }).presets.map((p) => ({
  id: p.id,
  name: p.name,
  sliders: { ...NEUTRAL_SLIDERS, ...p.sliders },
}))

export const DEFAULT_PRESET_ID = 'average'

/** Looks in the seed presets, then in any user presets passed in. */
export function getPreset(id: string, custom: readonly BodyPreset[] = []): BodyPreset | undefined {
  return BODY_PRESETS.find((p) => p.id === id) ?? custom.find((p) => p.id === id)
}

export function defaultPreset(): BodyPreset {
  const p = getPreset(DEFAULT_PRESET_ID)
  if (!p) throw new Error(`Missing default body preset "${DEFAULT_PRESET_ID}" in seeds/body-presets.json`)
  return p
}

/** Linear blend of two slider sets; t = 0 gives a, t = 1 gives b. */
export function blendSliders(a: BodySliders, b: BodySliders, t: number): BodySliders {
  const out = { ...a }
  for (const k of Object.keys(a) as (keyof BodySliders)[]) out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

/** "Modified from Athletic", or "Modified from Athletic (2)" if that name is taken. */
export function customPresetName(baseName: string, taken: readonly string[]): string {
  const name = `Modified from ${baseName}`
  if (!taken.includes(name)) return name
  let n = 2
  while (taken.includes(`${name} (${n})`)) n++
  return `${name} (${n})`
}
