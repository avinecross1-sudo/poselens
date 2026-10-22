// Export file names from the naming template. Pure; main fills {n} with the next free number on disk.

export const NAMING_TOKENS = ['{scene}', '{variant}', '{preset}', '{date}', '{n}'] as const
export const COUNTER_TOKEN = '{n}'

export interface NamingContext {
  scene: string
  /** Active shot name; empty when none is active. */
  variant: string
  preset: string
  date: Date
}

const pad2 = (v: number): string => String(v).padStart(2, '0')
export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/** Characters Windows and macOS reject in file names (and control characters). */
const UNSAFE = /[<>:"/\|?*\u0000-\u001f]/g

/** Windows/macOS-safe file or folder name; never empty. */
export function safeFileName(name: string, fallback = 'Untitled'): string {
  const cleaned = name.replace(UNSAFE, '_').trim().replace(/[. ]+$/, '')
  return cleaned.length > 0 ? cleaned : fallback
}

/**
 * Fills every token but {n}. Separators left dangling by an empty {variant} ("hero__1", "hero_") are tidied.
 * The result is file-name safe; {n} survives for main to fill.
 */
export function applyNamingTemplate(template: string, ctx: NamingContext): string {
  const filled = (template.trim() || '{scene}')
    .split('{scene}').join(ctx.scene)
    .split('{variant}').join(ctx.variant)
    .split('{preset}').join(ctx.preset)
    .split('{date}').join(isoDay(ctx.date))
  const tidy = filled.replace(/([_\- .])[_\- .]+/g, '$1').replace(/^[_\- .]+|[_\- .]+$/g, '')
  return safeFileName(tidy.split(COUNTER_TOKEN).map((part) => part.replace(UNSAFE, '_')).join(COUNTER_TOKEN), safeFileName(ctx.scene))
}

/** Replaces {n} with a number (1 when the template has a counter but nothing exists yet). */
export const fillCounter = (base: string, n: number): string => base.split(COUNTER_TOKEN).join(String(n))

/** First n >= 1 whose name is free; the name unchanged when it has no {n}. */
export function firstFreeName(base: string, taken: (name: string) => boolean): string {
  if (!base.includes(COUNTER_TOKEN)) return base
  let n = 1
  while (taken(fillCounter(base, n))) n++
  return fillCounter(base, n)
}
