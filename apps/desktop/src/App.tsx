import { useEffect, useState } from 'react'
import { loadScene, saveScene, type FileResult } from './export/sceneFile'
import { BottomBar } from './panels/BottomBar'
import { LeftPanel } from './panels/LeftPanel'
import { RightPanel } from './panels/RightPanel'
import { appStore } from './state/store'
import { startLibraryPersistence } from './state/libraryPersistence'
import { Viewport } from './three/Viewport'

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'))

export function App() {
  const [status, setStatus] = useState<FileResult | null>(null)

  useEffect(() => startLibraryPersistence(appStore), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return
      const s = appStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) s.undo()
      else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) s.redo()
      else if (mod && k === 's') void saveScene().then(setStatus)
      else if (mod && k === 'o') void loadScene().then(setStatus)
      else if (k === 'escape') {
        s.selectJoint(null)
        s.setCueTool('none')
      }
      else if (!mod && k === 'c') s.setActiveCamera(s.activeCamera === 'editor' ? 'shot' : 'editor')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="grid h-screen grid-cols-[300px_1fr_300px] grid-rows-[1fr_auto]">
      <div className="min-h-0">
        <LeftPanel onResult={setStatus} />
      </div>
      <main className="min-h-0 min-w-0">
        <Viewport />
      </main>
      <RightPanel onResult={setStatus} />
      <div className="col-span-3">
        <BottomBar status={status} onResult={setStatus} />
      </div>
    </div>
  )
}
