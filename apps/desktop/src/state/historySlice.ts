import type { StateCreator } from 'zustand'
import type { Command, Doc, HistorySlice, Store } from './types'

/** Oldest commands are dropped past this depth. */
export const MAX_HISTORY = 200

export const snapshotDoc = (s: Doc): Doc => ({ scene: s.scene, body: s.body, pose: s.pose, camera: s.camera })

const sameDoc = (a: Doc, b: Doc): boolean => JSON.stringify(a) === JSON.stringify(b)

const pushCommand = (past: Command[], cmd: Command): Command[] => [...past, cmd].slice(-MAX_HISTORY)

export const createHistorySlice: StateCreator<Store, [], [], HistorySlice> = (set, get) => ({
  history: { past: [], future: [], gesture: null },

  edit: (label, recipe, opts) => {
    if (opts?.preview) {
      // A different control starting a drag closes the previous gesture first.
      const open = get().history.gesture
      if (open && open.label !== label) get().endGesture()
      const gesture = get().history.gesture ?? { label, before: snapshotDoc(get()) }
      set((s) => ({ ...recipe(s), history: { ...s.history, gesture } }))
      return
    }
    get().endGesture()
    const before = snapshotDoc(get())
    set((s) => recipe(s))
    const after = snapshotDoc(get())
    if (sameDoc(before, after)) return
    set((s) => ({ history: { past: pushCommand(s.history.past, { label, before, after }), future: [], gesture: null } }))
  },

  endGesture: () => {
    const { gesture } = get().history
    if (!gesture) return
    const after = snapshotDoc(get())
    set((s) => ({
      history: sameDoc(gesture.before, after)
        ? { ...s.history, gesture: null }
        : { past: pushCommand(s.history.past, { label: gesture.label, before: gesture.before, after }), future: [], gesture: null },
    }))
  },

  undo: () => {
    get().endGesture()
    const { past, future } = get().history
    const cmd = past[past.length - 1]
    if (!cmd) return
    set({ ...cmd.before, history: { past: past.slice(0, -1), future: [cmd, ...future], gesture: null } })
  },

  redo: () => {
    get().endGesture()
    const { past, future } = get().history
    const cmd = future[0]
    if (!cmd) return
    set({ ...cmd.after, history: { past: [...past, cmd], future: future.slice(1), gesture: null } })
  },

  replaceDoc: (doc) => set({ ...doc, history: { past: [], future: [], gesture: null } }),
})
