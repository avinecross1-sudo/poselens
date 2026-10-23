// Lineart export: black lines from the figure's outline, depth steps (one part in front of another) and creases
// (normals turning sharply), on a transparent background. Works on two read-back buffers, so it is testable.

/** Normals more than this far apart across neighbouring pixels draw a crease line. */
export const CREASE_ANGLE_DEG = 38
/** A view-depth step bigger than this (m) between neighbours is an overlap contour. */
export const DEPTH_STEP_M = 0.03
/** Line half-width in px per 1000 px of output width (at least 1 px wide). */
export const LINE_RADIUS_PER_KPX = 0.6

export interface LineartInput {
  w: number
  h: number
  /** RGBA, rgb = view-space normal * 0.5 + 0.5, a > 0 where the figure is. */
  normals: Uint8Array
  /** RGBA, r * 256 + g = view depth mapped 0..65535 over [near, far]. */
  depth: Uint8Array
  near: number
  far: number
}

const DEPTH_LEVELS = 65535

export const decodeDepth = (d: Uint8Array, i: number, near: number, far: number): number =>
  near + (((d[i * 4] as number) * 256 + (d[i * 4 + 1] as number)) / DEPTH_LEVELS) * (far - near)

/** RGBA output, black lines (alpha 255) on transparent. Row order is the input's. */
export function lineart(input: LineartInput): Uint8ClampedArray<ArrayBuffer> {
  const { w, h, normals, depth, near, far } = input
  const n = w * h
  const cosCrease = Math.cos((CREASE_ANGLE_DEG * Math.PI) / 180)
  const inside = (i: number): boolean => (normals[i * 4 + 3] as number) > 0
  const nv = (i: number, k: number): number => ((normals[i * 4 + k] as number) / 255) * 2 - 1
  const dot = (a: number, b: number): number => {
    const ax = nv(a, 0), ay = nv(a, 1), az = nv(a, 2)
    const bx = nv(b, 0), by = nv(b, 1), bz = nv(b, 2)
    const la = Math.hypot(ax, ay, az) || 1
    const lb = Math.hypot(bx, by, bz) || 1
    return (ax * bx + ay * by + az * bz) / (la * lb)
  }
  const line = new Uint8Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!inside(i)) continue
      // Right and down neighbours; each edge is marked once, on its nearer side.
      for (const j of [x < w - 1 ? i + 1 : -1, y < h - 1 ? i + w : -1, x > 0 ? i - 1 : -1, y > 0 ? i - w : -1]) {
        if (j < 0 || !inside(j)) {
          line[i] = 1
          continue
        }
        if (j < i) continue
        const di = decodeDepth(depth, i, near, far)
        const dj = decodeDepth(depth, j, near, far)
        if (Math.abs(di - dj) > DEPTH_STEP_M) line[di < dj ? i : j] = 1
        else if (dot(i, j) < cosCrease) line[i] = 1
      }
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) line[i] = 1
    }
  }
  const r = Math.max(0, Math.round((LINE_RADIUS_PER_KPX * w) / 1000) - 1)
  const out = new Uint8ClampedArray(n * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!line[y * w + x]) continue
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || dx * dx + dy * dy > r * r + r) continue
          out[(yy * w + xx) * 4 + 3] = 255
        }
      }
    }
  }
  return out
}

/** WebGL reads rows bottom-up; this flips an RGBA buffer in place to top-down. */
export function flipRows(buf: Uint8Array | Uint8ClampedArray, w: number, h: number): void {
  const row = w * 4
  const tmp = new Uint8Array(row)
  for (let y = 0; y < Math.floor(h / 2); y++) {
    const a = y * row
    const b = (h - 1 - y) * row
    tmp.set(buf.subarray(a, a + row))
    buf.copyWithin(a, b, b + row)
    buf.set(tmp, b)
  }
}
