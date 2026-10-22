import { useEffect, useState } from 'react'
import type { FileResult } from '../export/sceneFile'
import { useStore } from '../state/store'
import { Toggle } from '../ui/Toggle'
import { BodyPanel } from './BodyPanel'
import { CameraDiagnosticsPanel } from './CameraDiagnosticsPanel'
import { ComparePanel } from './ComparePanel'
import { LandmarkPanel } from './LandmarkPanel'
import { PerspectivePanel } from './PerspectivePanel'
import { PosePanel } from './PosePanel'
import { SketchPanel } from './SketchPanel'

type Tab = 'body' | 'pose' | 'sketch'

export function LeftPanel({ onResult }: { onResult: (r: FileResult) => void }) {
  const [tab, setTab] = useState<Tab>('body')
  const selectedJoint = useStore((s) => s.selectedJoint)
  // Picking a joint in the viewport brings up its controls.
  useEffect(() => {
    if (selectedJoint) setTab('pose')
  }, [selectedJoint])
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 p-2">
        <Toggle
          options={[
            { value: 'body', label: 'Body' },
            { value: 'pose', label: 'Pose' },
            { value: 'sketch', label: 'Sketch' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'body' && <BodyPanel />}
        {tab === 'pose' && <PosePanel />}
        {tab === 'sketch' && (
          <div className="space-y-3">
            <SketchPanel onResult={onResult} />
            <ComparePanel />
            <PerspectivePanel />
            <CameraDiagnosticsPanel />
            <LandmarkPanel />
          </div>
        )}
      </div>
    </aside>
  )
}
