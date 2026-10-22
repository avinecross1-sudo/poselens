import { describe, expect, it } from 'vitest'
import { enclosedHoles } from '../src/lib/negativeSpace'
import { lensGuide, stretchAt, stretchRadius, WIDE_LENS_MM } from '../src/lib/lens'

/** Parses a picture: '#' = figure, '.' = background. */
function mask(rows: string[]): { m: Uint8Array; w: number; h: number } {
  const w = rows[0]!.length
  const h = rows.length
  const m = new Uint8Array(w * h)
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)))
  return { m, w, h }
}

describe('negative space', () => {
  it('finds background enclosed by the figure (arm on hip) but not the open background', () => {
    const { m, w, h } = mask([
      '..........',
      '..######..',
      '..#....#..',
      '..#....#..',
      '..######..',
      '..#....#..', // open at the bottom between the legs
      '..#....#..',
      '..#.....#.',
    ])
    const { mask: holes, areas } = enclosedHoles(m, w, h, 0)
    expect(areas).toEqual([8])
    expect(holes[2 * w + 4]).toBe(1)
    expect(holes[5 * w + 4]).toBe(0)
    expect(holes[0]).toBe(0)
  })

  it('drops holes smaller than the minimum share', () => {
    const { m, w, h } = mask(['#####', '#.#.#', '#####'])
    expect(enclosedHoles(m, w, h, 0).areas).toEqual([1, 1])
    expect(enclosedHoles(m, w, h, 0.1).areas).toEqual([])
  })

  it('diagonal gaps do not leak (4-connected fill)', () => {
    const { m, w, h } = mask(['.#.', '#.#', '.#.'])
    expect(enclosedHoles(m, w, h, 0).areas).toEqual([1])
  })
})

describe('wide-lens stretch', () => {
  it('stretch is 1 on axis and 1 / cos(angle) off axis', () => {
    expect(stretchAt(0, 24, 24)).toBe(1)
    // r = 1 half-frame-height at f = 12 mm on a 24 mm sensor: tan = 1 -> 45° -> sqrt(2).
    expect(stretchAt(1, 12, 24)).toBeCloseTo(Math.SQRT2)
    expect(stretchAt(stretchRadius(1.25, 16, 24), 16, 24)).toBeCloseTo(1.25)
  })

  it('wide below 24 mm; rings that fit inside the frame only', () => {
    const wide = lensGuide(10, 24, 2 / 3)
    expect(wide.wide).toBe(true)
    expect(wide.rings.map((r) => r.level)).toEqual([1.1, 1.25, 1.5])
    expect(wide.cornerStretch).toBeGreaterThan(1.5)
    // At 14 mm the ×1.5 ring falls outside a 2:3 frame (corners stretch about ×1.44).
    const fourteen = lensGuide(14, 24, 2 / 3)
    expect(fourteen.rings.map((r) => r.level)).toEqual([1.1, 1.25])
    expect(fourteen.cornerStretch).toBeCloseTo(1.436, 2)
    const normal = lensGuide(50, 24, 2 / 3)
    expect(normal.wide).toBe(false)
    expect(normal.rings).toEqual([])
    expect(lensGuide(WIDE_LENS_MM, 24, 1).wide).toBe(false)
  })
})
