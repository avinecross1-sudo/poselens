// Copy / paste of camera, body profile and pose between scenes. The clipboard is app state, not part of
// the document, so it survives loading another scene. Every paste is one undo step.
import type { StateCreator } from 'zustand'
import { keepLocked, lockedJoints } from '../lib/poseOps'
import { activeStylizeMatrix } from '../solve/fk'
import { retargetPose } from '../solve/retarget'
import { computeRig } from '../three/bodyRig'
import type { BodyState, ClipboardEntry, ClipboardProvenance, PoseState } from '../types/scene'
import { mergeUnlocked } from './bodySliders'
import { getPreset } from './presets'
import { rigOf, stylizeOf } from './rigOf'
import type { ClipboardSlice, Store } from './types'

function provenance(s: Store): ClipboardProvenance {
  return {
    sceneName: s.sceneName,
    copiedAt: new Date().toISOString(),
    presetId: s.body.presetId,
    sourceBody: structuredClone({ sliders: s.body.sliders, asymmetry: s.body.asymmetry, stylizedOverride: s.body.stylizedOverride }),
  }
}

const entry = <T>(s: Store, value: T): ClipboardEntry<T> => ({ value: structuredClone(value), provenance: provenance(s) })

/** "Heroic body from Scene A" – for paste button titles and status lines. */
export function describeProvenance(p: ClipboardProvenance, custom: Store['customPresets'] = []): string {
  const preset = getPreset(p.presetId, custom)?.name ?? p.presetId
  return `${p.sceneName || 'Untitled'} (${preset}, copied ${new Date(p.copiedAt).toLocaleTimeString()})`
}

/** The body profile from the clipboard over the current body: locked sliders keep their values, locks stay. */
export function pastedBody(current: BodyState, src: BodyState): BodyState {
  return {
    ...current,
    presetId: src.presetId,
    modifiedFrom: src.modifiedFrom,
    sliders: mergeUnlocked(current.sliders, src.sliders, current.locks),
    asymmetry: { ...src.asymmetry },
    stylizedOverride: src.stylizedOverride ? structuredClone(src.stylizedOverride) : null,
  }
}

/** A copied pose on the current body: retargeted from the body it was posed on; locks, locked joints and hands stay. */
export function pastedPose(current: { body: BodyState; pose: PoseState }, src: ClipboardEntry<PoseState>): { pose: PoseState; warnings: string[] } {
  const from = src.provenance.sourceBody
  const r = retargetPose(src.value, computeRig(from.sliders, from.asymmetry), rigOf(current.body), {
    from: activeStylizeMatrix(from.stylizedOverride),
    to: stylizeOf(current.body),
  })
  const locked = lockedJoints(current.pose)
  return {
    pose: {
      ...r.pose,
      joints: keepLocked(current.pose, r.pose.joints, locked),
      hands: {
        L: locked.has('handL') ? current.pose.hands.L : r.pose.hands.L,
        R: locked.has('handR') ? current.pose.hands.R : r.pose.hands.R,
      },
      jointLocks: current.pose.jointLocks,
      ikLocks: current.pose.ikLocks,
      // Nudges belong to a sketch solve in the source scene.
      depthNudges: {},
    },
    warnings: r.warnings,
  }
}

export const createClipboardSlice: StateCreator<Store, [], [], ClipboardSlice> = (set, get) => ({
  clipboard: {},

  copyCamera: () => set((s) => ({ clipboard: { ...s.clipboard, camera: entry(s, s.camera) } })),
  copyBody: () => set((s) => ({ clipboard: { ...s.clipboard, body: entry(s, s.body) } })),
  copyPose: () => set((s) => ({ clipboard: { ...s.clipboard, pose: entry(s, s.pose) } })),

  pasteCamera: () => {
    const s = get()
    const c = s.clipboard.camera
    if (!c || s.sketchView.traceLock) return false
    s.edit(`Paste camera from ${c.provenance.sceneName}`, () => ({ camera: structuredClone(c.value) }))
    return true
  },

  pasteBody: () => {
    const s = get()
    const c = s.clipboard.body
    if (!c) return false
    const out: { warnings: string[] } = { warnings: [] }
    s.edit(`Paste body from ${c.provenance.sceneName}`, (st) => {
      const body = pastedBody(st.body, c.value)
      const r = retargetPose(st.pose, rigOf(st.body), rigOf(body), { from: stylizeOf(st.body), to: stylizeOf(body) })
      out.warnings = r.warnings
      return { body, pose: r.pose }
    })
    get().setPoseWarnings(out.warnings)
    return true
  },

  pastePose: () => {
    const s = get()
    const c = s.clipboard.pose
    if (!c) return false
    const out: { warnings: string[] } = { warnings: [] }
    s.edit(`Paste pose from ${c.provenance.sceneName}`, (st) => {
      const r = pastedPose(st, c)
      out.warnings = r.warnings
      return { pose: r.pose }
    })
    get().setPoseWarnings(out.warnings)
    return true
  },
})
