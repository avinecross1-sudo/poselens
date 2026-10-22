import { useMemo } from 'react'
import { radToDeg } from '../lib/units'
import { cameraDiagnostics, type FocalSource } from '../solve/cameraDiagnostics'
import { useStore } from '../state/store'
import type { ConfidenceLevel } from '../types/scene'
import { Section } from '../ui/Section'

const CONFIDENCE_STYLE: Record<ConfidenceLevel, string> = {
  green: 'bg-emerald-700 text-emerald-100',
  yellow: 'bg-amber-700 text-amber-100',
  red: 'bg-red-800 text-red-100',
}
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { green: 'Consistent', yellow: 'Check', red: 'Inconsistent' }
const SOURCE_LABEL: Record<FocalSource, string> = {
  vps: 'from the vanishing points',
  figure: 'found from the figure',
  suggested: 'not fixed by the cues',
}

/** Camera solve diagnostics: suggested focal range, confidence, and inconsistency warnings. */
export function CameraDiagnosticsPanel() {
  const sketch = useStore((s) => s.sketch)
  const camera = useStore((s) => s.camera)
  const d = useMemo(() => cameraDiagnostics(sketch, camera), [sketch, camera])
  if (sketch.hash === null) return null

  return (
    <Section title="Camera diagnostics">
      {d.confidence === null ? (
        <p className="text-xs text-neutral-500">Solve the camera or the pose to see how well the camera fits the drawing.</p>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-neutral-300">Overall</span>
            <span className={`rounded px-1.5 py-0.5 ${CONFIDENCE_STYLE[d.confidence]}`}>{CONFIDENCE_LABEL[d.confidence]}</span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 text-neutral-400">
            {d.focalMm !== null && (
              <>
                <span>Focal</span>
                <span className="text-neutral-200">
                  {d.focalMm.toFixed(0)} mm{d.focalSource ? ` (${SOURCE_LABEL[d.focalSource]})` : ''}
                </span>
              </>
            )}
            {d.focalRangeMm && (
              <>
                <span>{d.focalSource === 'vps' ? 'Range' : 'Suggested'}</span>
                <span className="text-neutral-200">
                  {d.focalRangeMm[0].toFixed(0)}–{d.focalRangeMm[1].toFixed(0)} mm
                </span>
              </>
            )}
            <span>Shot camera</span>
            <span className="text-neutral-200">{camera.focal.toFixed(0)} mm</span>
            {d.pitch !== null && (
              <>
                <span>Pitch / roll</span>
                <span className="text-neutral-200">
                  {radToDeg(d.pitch).toFixed(1)}° / {radToDeg(d.roll ?? 0).toFixed(1)}°
                </span>
              </>
            )}
          </div>
          {d.cueWarnings.length > 0 && (
            <div>
              <div className="text-neutral-500">From the cues</div>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-400">
                {d.cueWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {d.consistency.length > 0 && (
            <div>
              <div className="text-neutral-500">Consistency</div>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-400">
                {d.consistency.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {d.cueWarnings.length === 0 && d.consistency.length === 0 && <p className="text-emerald-400">The camera agrees with the cues and the figure.</p>}
        </div>
      )}
    </Section>
  )
}
