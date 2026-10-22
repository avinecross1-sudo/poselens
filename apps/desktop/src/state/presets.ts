// Body presets come from /seeds/body-presets.json, bundled at build time (read-only).
import presetsJson from '@seeds/body-presets.json'
import type { BodySliders } from '../types/scene'

export interface BodyPreset {
  id: string
  name: string
  sliders: BodySliders
}

export const BODY_PRESETS: readonly BodyPreset[] = (presetsJson as { presets: BodyPreset[] }).presets

export const DEFAULT_PRESET_ID = 'average'

export function getPreset(id: string): BodyPreset | undefined {
  return BODY_PRESETS.find((p) => p.id === id)
}

export function defaultPreset(): BodyPreset {
  const p = getPreset(DEFAULT_PRESET_ID)
  if (!p) throw new Error(`Missing default body preset "${DEFAULT_PRESET_ID}" in seeds/body-presets.json`)
  return p
}
