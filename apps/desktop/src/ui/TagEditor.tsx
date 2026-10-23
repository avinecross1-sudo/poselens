import { useState } from 'react'

/** Tag chips with an add field (Enter or comma adds). */
export function TagEditor({ tags, onAdd, onRemove, placeholder = 'Add tag' }: { tags: readonly string[]; onAdd: (t: string) => void; onRemove: (t: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('')
  const commit = (): void => {
    for (const t of draft.split(',')) if (t.trim()) onAdd(t)
    setDraft('')
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {tags.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200">
          {t}
          <button type="button" className="text-neutral-500 hover:text-red-300" title={`Remove ${t}`} onClick={() => onRemove(t)}>
            ✕
          </button>
        </span>
      ))}
      <input
        className="min-w-[5rem] flex-1 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
        onBlur={commit}
      />
    </div>
  )
}

/** Notes text area that reports every keystroke (callers coalesce them into one undo step on blur). */
export function NotesField({ value, onChange, onBlur, placeholder = 'Notes' }: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) {
  return (
    <textarea
      className="h-16 w-full resize-y rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:ring-1 focus:ring-sky-500"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
    />
  )
}
