import type { FileResult } from '../export/sceneFile'
import { CameraPanel } from './CameraPanel'
import { ExportPanel } from './ExportPanel'

export function RightPanel({ onResult }: { onResult: (r: FileResult) => void }) {
  return (
    <aside className="h-full space-y-6 overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-3">
      <CameraPanel />
      <ExportPanel onResult={onResult} />
    </aside>
  )
}
