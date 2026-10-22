import { useRef, useState } from 'react'
import { FOOT_PRESETS, ryToToeDirection } from '../lib/poseOps'
import { degToRad, radToDeg } from '../lib/units'
import { IK_CHAIN_IDS, IK_CHAINS } from '../solve/ik'
import { POSE_LIBRARY, POSE_TAGS, searchPoses } from '../state/poseLibrary'
import { buildLibraryPose } from '../state/poseSlice'
import { appStore, useStore } from '../state/store'
import { HAND_SHAPES, type PoseState, type Side } from '../types/scene'
import { LockButton } from '../ui/LockButton'
import { chipBtn, Section, smallBtn } from '../ui/Section'
import { Slider } from '../ui/Slider'
import { JointPanel } from './JointPanel'

const SIDES: readonly { side: Side; label: string }[] = [
  { side: 'L', label: 'Left' },
  { side: 'R', label: 'Right' },
]
/** Toe direction slider range, degrees (positive = toes out). */
const TOE_DIRECTION_RANGE_DEG = 30
const CURRENT = '__current'

export function PosePanel() {
  const resetPose = useStore((s) => s.resetPose)
  const mirrorPose = useStore((s) => s.mirrorPose)
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Pose</h2>
        <div className="flex gap-1">
          <button type="button" className={smallBtn} onClick={mirrorPose} title="Swap left and right">
            Mirror
          </button>
          <button type="button" className={smallBtn} onClick={resetPose}>
            Reset pose
          </button>
        </div>
      </div>
      <PoseLibrarySection />
      <PoseBlendSection />
      <JointPanel />
      <IkSection />
      <HandsFeetSection />
    </section>
  )
}

function PoseLibrarySection() {
  const favorites = useStore((s) => s.favoritePoses)
  const toggleFavoritePose = useStore((s) => s.toggleFavoritePose)
  const applyLibraryPose = useStore((s) => s.applyLibraryPose)
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [favOnly, setFavOnly] = useState(false)
  const results = searchPoses(query, { tag, favoritesOnly: favOnly, favorites })

  return (
    <Section title="Pose library">
      <input
        className="mb-1 w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
        placeholder="Search poses"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="mb-1 flex flex-wrap gap-1">
        <button type="button" className={chipBtn(favOnly)} onClick={() => setFavOnly(!favOnly)}>
          ★ Favorites
        </button>
        {POSE_TAGS.map((t) => (
          <button key={t} type="button" className={chipBtn(tag === t)} onClick={() => setTag(tag === t ? null : t)}>
            {t}
          </button>
        ))}
      </div>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto">
        {results.map((p) => {
          const fav = favorites.includes(p.id)
          return (
            <li key={p.id} className="flex items-center gap-1">
              <button
                type="button"
                title={fav ? 'Remove from favorites' : 'Add to favorites'}
                onClick={() => toggleFavoritePose(p.id)}
                className={`w-5 text-sm ${fav ? 'text-amber-400' : 'text-neutral-600 hover:text-neutral-300'}`}
              >
                {fav ? '★' : '☆'}
              </button>
              <button
                type="button"
                onClick={() => applyLibraryPose(p.id)}
                className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-xs text-neutral-200 hover:bg-neutral-800"
              >
                {p.name}
                <span className="ml-1 text-neutral-500">{p.tags.join(' · ')}</span>
              </button>
            </li>
          )
        })}
        {results.length === 0 && <li className="text-xs text-neutral-500">No poses match.</li>}
      </ul>
    </Section>
  )
}

function PoseBlendSection() {
  const blendPose = useStore((s) => s.blendPose)
  const endGesture = useStore((s) => s.endGesture)
  const [aId, setA] = useState(CURRENT)
  const [bId, setB] = useState(POSE_LIBRARY[0]?.id ?? '')
  const [t, setT] = useState(0)
  // Endpoints are captured when a drag starts, so blending from "Current" does not chase itself.
  const ends = useRef<{ from: PoseState; to: PoseState } | null>(null)

  const resolve = (id: string, current: PoseState): PoseState | null =>
    id === CURRENT ? current : buildLibraryPose(appStore.getState(), id)

  const onChange = (v: number, preview: boolean): void => {
    setT(v)
    if (!ends.current) {
      const current = appStore.getState().pose
      const from = resolve(aId, current)
      const to = resolve(bId, current)
      if (!from || !to) return
      ends.current = { from, to }
    }
    blendPose(ends.current.from, ends.current.to, v, { preview })
    if (!preview) ends.current = null
  }

  const select = (value: string, onPick: (v: string) => void, allowCurrent: boolean) => (
    <select
      className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200"
      value={value}
      onChange={(e) => {
        onPick(e.target.value)
        ends.current = null
        setT(0)
      }}
    >
      {allowCurrent && <option value={CURRENT}>Current pose</option>}
      {POSE_LIBRARY.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )

  return (
    <Section title="Blend poses" defaultOpen={false}>
      <div className="flex items-center gap-1">
        {select(aId, setA, true)}
        <span className="text-xs text-neutral-500">→</span>
        {select(bId, setB, false)}
      </div>
      <Slider
        label="Blend"
        value={t}
        min={0}
        max={1}
        step={0.01}
        onChange={onChange}
        onCommit={() => {
          ends.current = null
          endGesture()
        }}
      />
    </Section>
  )
}

function IkSection() {
  const ikEnabled = useStore((s) => s.ikEnabled)
  const ikLocks = useStore((s) => s.pose.ikLocks)
  const setIkEnabled = useStore((s) => s.setIkEnabled)
  const toggleChainLock = useStore((s) => s.toggleChainLock)
  return (
    <Section title="IK chains & limb locks">
      <p className="mb-1 text-[11px] text-neutral-500">
        Drag the cyan wrist and ankle handles to pose a limb. IK respects joint limits and skips locked joints.
      </p>
      {IK_CHAIN_IDS.map((c) => (
        <div key={c} className="flex items-center justify-between py-0.5 text-xs text-neutral-300">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={ikEnabled[c]} onChange={(e) => setIkEnabled(c, e.target.checked)} />
            {IK_CHAINS[c].label} IK
          </label>
          <LockButton locked={ikLocks.includes(c)} onClick={() => toggleChainLock(c)} title={`Lock the whole ${IK_CHAINS[c].label.toLowerCase()}`} />
        </div>
      ))}
    </Section>
  )
}

function HandsFeetSection() {
  const hands = useStore((s) => s.pose.hands)
  const joints = useStore((s) => s.pose.joints)
  const setHandShape = useStore((s) => s.setHandShape)
  const applyFootPreset = useStore((s) => s.applyFootPreset)
  const setToeDirection = useStore((s) => s.setToeDirection)
  const endGesture = useStore((s) => s.endGesture)

  return (
    <Section title="Hands & feet" defaultOpen={false}>
      {SIDES.map(({ side, label }) => (
        <div key={`hand${side}`} className="mb-1">
          <div className="text-xs text-neutral-400">{label} hand</div>
          <div className="flex flex-wrap gap-1">
            {HAND_SHAPES.map((h) => (
              <button key={h} type="button" className={chipBtn(hands[side] === h)} onClick={() => setHandShape(side, h)}>
                {h}
              </button>
            ))}
          </div>
        </div>
      ))}
      {SIDES.map(({ side, label }) => (
        <div key={`foot${side}`} className="mb-1">
          <div className="text-xs text-neutral-400">{label} foot</div>
          <div className="flex flex-wrap gap-1">
            {FOOT_PRESETS.map((f) => (
              <button key={f} type="button" className={chipBtn(false)} onClick={() => applyFootPreset(side, f)}>
                {f}
              </button>
            ))}
          </div>
          <Slider
            label="Toe direction (out +)"
            value={ryToToeDirection(side, joints[`foot${side}`].ry)}
            min={-TOE_DIRECTION_RANGE_DEG}
            max={TOE_DIRECTION_RANGE_DEG}
            step={1}
            unit="°"
            decimals={0}
            toDisplay={radToDeg}
            fromDisplay={degToRad}
            onChange={(v, preview) => setToeDirection(side, v, { preview })}
            onCommit={endGesture}
          />
        </div>
      ))}
    </Section>
  )
}
