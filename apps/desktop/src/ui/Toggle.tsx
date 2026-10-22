export interface ToggleOption<T extends string> {
  value: T
  label: string
}

export function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly [ToggleOption<T>, ToggleOption<T>]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-neutral-700 bg-neutral-900 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`px-3 py-1 ${o.value === value ? 'bg-sky-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
