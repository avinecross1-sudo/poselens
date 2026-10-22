import { BodyPanel } from './BodyPanel'
import { JointPanel } from './JointPanel'

export function LeftPanel() {
  return (
    <aside className="h-full space-y-6 overflow-y-auto border-r border-neutral-800 bg-neutral-900 p-3">
      <BodyPanel />
      <JointPanel />
    </aside>
  )
}
