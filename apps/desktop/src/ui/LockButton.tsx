export function LockButton({ locked, onClick, title }: { locked: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (locked ? 'Unlock' : 'Lock')}
      aria-pressed={locked}
      className={`w-5 shrink-0 rounded text-center text-[11px] leading-5 ${
        locked ? 'bg-red-900/70 text-red-200' : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200'
      }`}
    >
      {locked ? '🔒' : '🔓'}
    </button>
  )
}
