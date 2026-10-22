// "Next uncertain joint" button: cycles the selection through the low-confidence joints of the last solve.
import { useMemo } from 'react'
import { nextUncertain, uncertainJoints } from '../state/review'
import { useStore } from '../state/store'

const DOT: Record<string, string> = { red: 'bg-red-500', yellow: 'bg-yellow-400', green: 'bg-emerald-500' }

export function ReviewNext({ compact = false }: { compact?: boolean }) {
  const sketch = useStore((s) => s.sketch)
  const selected = useStore((s) => s.selectedJoint)
  const selectJoint = useStore((s) => s.selectJoint)
  const list = useMemo(() => uncertainJoints(sketch), [sketch])
  if (list.length === 0) return null
  const i = list.findIndex((u) => u.joint === selected)
  const cur = i >= 0 ? list[i] : undefined
  const go = (): void => {
    const n = nextUncertain(list, selected)
    if (n) selectJoint(n.joint)
  }
  return (
    <div className={`flex items-center gap-2 text-xs ${compact ? 'rounded bg-black/60 px-2 py-1 text-neutral-200' : 'text-neutral-300'}`}>
      {cur ? (
        <span className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[cur.confidence]}`} />
          {i + 1}/{list.length} {cur.joint}
          {cur.residualCm !== null ? ` · ${cur.residualCm.toFixed(1)} cm` : ''}
          {cur.ambiguous ? ' · depth could flip' : ''}
        </span>
      ) : (
        <span>{list.length} joint{list.length === 1 ? '' : 's'} to review</span>
      )}
      <button type="button" className="rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-500" onClick={go}>
        Next uncertain joint
      </button>
    </div>
  )
}
