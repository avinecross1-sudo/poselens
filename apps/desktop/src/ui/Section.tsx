import { useState, type ReactNode } from 'react'

/** Collapsible panel section with optional header controls on the right. */
export function Section({
  title,
  children,
  actions,
  defaultOpen = true,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-neutral-800 pt-2">
      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs uppercase tracking-wide text-neutral-400 hover:text-neutral-200"
        >
          <span className="w-3 text-neutral-500">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {open && children}
    </div>
  )
}

export const smallBtn = 'rounded px-1.5 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-40'
export const chipBtn = (active: boolean): string =>
  `rounded px-2 py-0.5 text-xs ${active ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`
