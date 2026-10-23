export function PresetCard({
  name,
  height,
  active,
  modified,
  tags,
  onClick,
}: {
  name: string
  height: number
  active: boolean
  modified: boolean
  tags?: readonly string[]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-1.5 text-left text-xs transition-colors ${
        active ? 'border-sky-500 bg-sky-950/60 text-white' : 'border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-500'
      }`}
    >
      <div className="font-medium">
        {name}
        {active && modified && <span className="ml-1 text-amber-400">*</span>}
      </div>
      <div className="text-neutral-500">{height.toFixed(2)} m</div>
      {tags && tags.length > 0 && <div className="truncate text-[10px] text-sky-300/80">{tags.join(' · ')}</div>}
    </button>
  )
}
