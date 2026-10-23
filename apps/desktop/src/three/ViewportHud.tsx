// HTML layer over the viewport: overlay toggles, measurement readout, stylized and pose warnings.
// Viewport-only; nothing here reaches exported PNGs.
import { useMemo } from 'react'
import { limbLengths, measure } from '../lib/measure'
import { rigOf } from '../state/rigOf'
import { useStore } from '../state/store'
import type { Overlays, ViewLook } from '../state/types'
import { Toggle } from '../ui/Toggle'
import { alwaysShownBalanceWarning, leanLabel, type FootState } from '../lib/balance'
import { ReviewNext } from '../ui/ReviewNext'

const CM_PER_M = 100
const cm = (m: number): string => `${(m * CM_PER_M).toFixed(1)} cm`

const OVERLAY_TOGGLES: readonly { key: keyof Overlays; label: string }[] = [
  { key: 'headUnits', label: 'Head units' },
  { key: 'gaze', label: 'Gaze' },
  { key: 'ikHandles', label: 'IK handles' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'balance', label: 'Balance' },
  { key: 'negativeSpace', label: 'Negative space' },
  { key: 'occlusion', label: 'Hidden parts' },
  { key: 'lensGuide', label: 'Lens' },
]

const LOOK_OPTIONS: readonly { value: ViewLook; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'silhouette', label: 'Silhouette' },
  { value: 'values', label: 'Values' },
  { value: 'depth', label: 'Depth' },
]
const PERCENT = 100
const STATE_LABEL: Record<FootState, string> = { planted: 'planted', edge: 'on an edge', floating: 'in the air' }


export function ViewportHud() {
  const body = useStore((s) => s.body)
  const overlays = useStore((s) => s.overlays)
  const setOverlay = useStore((s) => s.setOverlay)
  const selectedJoint = useStore((s) => s.selectedJoint)
  const warnings = useStore((s) => s.poseWarnings)
  const acknowledgeStylized = useStore((s) => s.acknowledgeStylized)
  const viewLook = useStore((s) => s.viewLook)
  const setViewLook = useStore((s) => s.setViewLook)
  const balance = useStore((s) => s.balance)
  const rootYaw = useStore((s) => s.pose.rootTransform.rotation[1])
  const balanceWarnings = (balance?.warnings ?? []).filter((w) => overlays.balance || alwaysShownBalanceWarning(w))
  const lean = balance ? leanLabel(balance, rootYaw) : null

  const rig = useMemo(() => rigOf(body), [body])
  const m = useMemo(() => measure(rig), [rig])
  const limb = selectedJoint ? limbLengths(rig, selectedJoint) : null
  const stylized = body.stylizedOverride

  return (
    <>
      <div className="pointer-events-auto absolute right-3 top-3 flex max-w-[60%] flex-col items-end gap-1 text-xs">
      <div className="flex flex-wrap justify-end gap-1">
        {OVERLAY_TOGGLES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOverlay(t.key, !overlays[t.key])}
            className={`rounded border px-2 py-1 ${
              overlays[t.key] ? 'border-emerald-500 bg-emerald-900/60 text-emerald-100' : 'border-neutral-700 bg-black/50 text-neutral-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div title="Readability look (viewport only; export uses its own preset)">
        <Toggle options={LOOK_OPTIONS} value={viewLook} onChange={setViewLook} />
      </div>
      </div>

      {overlays.balance && balance && (
        <div className="pointer-events-none absolute right-3 top-24 w-48 rounded bg-black/60 p-2 text-xs text-neutral-300">
          <div className="mb-1 font-semibold text-sky-300">Balance</div>
          <Row k="Left foot" v={STATE_LABEL[balance.feet.L]} />
          <Row k="Right foot" v={STATE_LABEL[balance.feet.R]} />
          {balance.weight && (
            <div className="my-1">
              <div className="flex justify-between text-neutral-400">
                <span>L {Math.round(balance.weight.L * PERCENT)}%</span>
                <span>R {Math.round(balance.weight.R * PERCENT)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-neutral-700">
                <div className="h-full bg-sky-400" style={{ width: `${balance.weight.L * PERCENT}%` }} />
              </div>
            </div>
          )}
          <Row k="CoM height" v={cm(balance.com[1])} />
          {lean && <Row k="Lean" v={lean} />}
          {balance.contacts.length > 0 && <Row k="Outside support" v={balance.outsideBy > 0 ? cm(balance.outsideBy) : 'no'} />}
        </div>
      )}

      {overlays.headUnits && (
        <div className="pointer-events-none absolute right-3 top-12 w-48 rounded bg-black/60 p-2 text-xs text-neutral-300">
          <div className="mb-1 font-semibold text-emerald-300">
            {m.heads.toFixed(1)} heads · {m.height.toFixed(2)} m
          </div>
          <Row k="Head unit" v={cm(m.headUnit)} />
          <Row k="Shoulder width" v={cm(m.shoulderWidth)} />
          <Row k="Hip width" v={cm(m.hipWidth)} />
          {limb && (
            <div className="mt-1 border-t border-neutral-700 pt-1">
              <div className="text-neutral-400">{limb.label}</div>
              {limb.bones.map((b) => (
                <Row key={b.name} k={b.name} v={cm(b.length)} />
              ))}
              <Row k="Total" v={`${cm(limb.total)} (${(limb.total / m.headUnit).toFixed(1)} heads)`} />
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-col items-start gap-1 text-xs">
        <div className="pointer-events-auto">
          <ReviewNext compact />
        </div>
        {stylized && stylized.acknowledged && (
          <div className="rounded bg-amber-900/80 px-2 py-1 text-amber-100">
            Stylized override active: non-uniform scale distorts real proportions and measurements.
          </div>
        )}
        {stylized && !stylized.acknowledged && (
          <div className="pointer-events-auto rounded bg-amber-900/80 px-2 py-1 text-amber-100">
            This scene has a stylized override that is not applied until acknowledged.{' '}
            <button type="button" className="underline" onClick={() => acknowledgeStylized(true)}>
              Acknowledge and apply
            </button>
          </div>
        )}
        {balanceWarnings.map((w) => (
          <div key={w} className="rounded bg-amber-900/85 px-2 py-1 text-amber-100">
            {w}
          </div>
        ))}
        {warnings.map((w) => (
          <div key={w} className="rounded bg-red-950/80 px-2 py-1 text-red-200">
            {w}
          </div>
        ))}
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-400">{k}</span>
      <span>{v}</span>
    </div>
  )
}
