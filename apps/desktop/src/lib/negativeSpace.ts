// Negative space: background regions the figure fully encloses (between an arm and the torso, between the
// legs). Works on a figure mask; the viewport renders the mask and tints the holes. Pure, so it is testable.

/** Holes smaller than this share of the image are ignored (gaps between fingers, anti-aliasing specks). */
export const MIN_HOLE_SHARE = 0.0004

export interface Holes {
  /** 1 where a pixel is enclosed background, else 0. */
  mask: Uint8Array
  /** Pixel count of each kept hole. */
  areas: number[]
}

/**
 * Flood-fills the background from the image border (4-connected); background the fill never reaches is
 * enclosed. `figure[i]` is non-zero where the figure covers pixel i (row-major, width w).
 */
export function enclosedHoles(figure: ArrayLike<number>, w: number, h: number, minShare = MIN_HOLE_SHARE): Holes {
  const n = w * h
  /** 0 = unvisited background, 1 = figure, 2 = outside, 3 = hole. */
  const state = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (figure[i]) state[i] = 1
  const stack: number[] = []
  const seed = (i: number): void => {
    if (state[i] === 0) {
      state[i] = 2
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  const fill = (mark: number): number => {
    let count = 0
    while (stack.length) {
      const i = stack.pop() as number
      count++
      const x = i % w
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < n - w ? i + w : -1]
      for (const j of next) {
        if (j >= 0 && state[j] === 0) {
          state[j] = mark
          stack.push(j)
        }
      }
    }
    return count
  }
  fill(2)

  const mask = new Uint8Array(n)
  const areas: number[] = []
  const minArea = Math.max(1, Math.round(n * minShare))
  for (let i = 0; i < n; i++) {
    if (state[i] !== 0) continue
    state[i] = 3
    stack.push(i)
    const start = i
    const area = fill(3)
    if (area < minArea) continue
    areas.push(area)
    // Second pass over this hole only: re-walk it to write the mask.
    const walk = [start]
    mask[start] = 1
    while (walk.length) {
      const k = walk.pop() as number
      const x = k % w
      for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k >= w ? k - w : -1, k < n - w ? k + w : -1]) {
        if (j >= 0 && state[j] === 3 && !mask[j]) {
          mask[j] = 1
          walk.push(j)
        }
      }
    }
  }
  return { mask, areas }
}
