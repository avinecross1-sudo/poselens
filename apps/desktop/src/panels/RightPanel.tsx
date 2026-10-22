import type { FileResult } from '../export/sceneFile'
import { CameraPanel } from './CameraPanel'
import { ClipboardPanel } from './ClipboardPanel'
import { ExportPanel } from './ExportPanel'
import { ScenePanel } from './ScenePanel'
import { ShotsPanel } from './ShotsPanel'

export function RightPanel({ onResult }: { onResult: (r: FileResult) => void }) {
  return (
    <aside className="h-full space-y-6 overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-3">
      <CameraPanel />
      <ShotsPanel />
      <ClipboardPanel />
      <ScenePanel />
      <ExportPanel onResult={onResult} />
    </aside>
  )
}
