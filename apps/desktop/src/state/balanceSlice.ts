// Balance is derived from body + pose (docs/balance-spec.md). startBalanceSync keeps it current; nothing
// here is saved (metadata recomputes it on save).
import type { StateCreator } from 'zustand'
import { computeBalance, type BalanceResult } from '../lib/balance'
import { rigOf, stylizeOf } from './rigOf'
import type { AppStore } from './store'
import type { BalanceSlice, Store } from './types'

export const createBalanceSlice: StateCreator<Store, [], [], BalanceSlice> = (set) => ({
  balance: null,
  setBalance: (balance) => set({ balance }),
})

export function balanceOf(s: Pick<Store, 'body' | 'pose'>, previous: BalanceResult | null = null): BalanceResult {
  return computeBalance({ rig: rigOf(s.body), pose: s.pose, sliders: s.body.sliders, stylize: stylizeOf(s.body), previous })
}

/** Recomputes balance whenever body or pose change. Foot sliding is checked between frames of a live drag. */
export function startBalanceSync(store: AppStore): () => void {
  store.getState().setBalance(balanceOf(store.getState()))
  return store.subscribe((s, prev) => {
    if (s.body === prev.body && s.pose === prev.pose) return
    const dragging = s.history.gesture !== null && s.body === prev.body
    s.setBalance(balanceOf(s, dragging ? s.balance : null))
  })
}
