// Generates the synthetic two-point-perspective sketch fixture:
//   synthetic-2pt.png   a line drawing of two boxes on a ground grid, drawn through a pinhole camera
//   synthetic-2pt.json  the exact horizon + vanishing points of that drawing (image space) and the camera truth
//
// Run from apps/desktop:  node test/fixtures/generate-sketch-fixture.mjs
// The projection here is written independently of src/solve so the tests check the solver against it.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))

// ---- Truth camera (CameraState conventions: pitch + = up, roll + = world-up leans toward +x on screen) ----
const WIDTH = 1000
const HEIGHT = 1500
const ASPECT = WIDTH / HEIGHT
const TRUTH = { pitchDeg: -10, rollDeg: 4, focalMm: 28, sensorHeightMm: 24, gridYawDeg: 50 }
const CAMERA_HEIGHT_M = 1.6
const NEAR_M = 0.2

const rad = (d) => (d * Math.PI) / 180
const f = TRUTH.focalMm / TRUTH.sensorHeightMm // focal length in frame heights
const th = rad(TRUTH.pitchDeg)
const ro = rad(TRUTH.rollDeg)
const fwd = [0, Math.sin(th), -Math.cos(th)]
const right0 = [1, 0, 0]
const up0 = [0, Math.cos(th), Math.sin(th)]
const right = right0.map((v, i) => Math.cos(ro) * v + Math.sin(ro) * up0[i])
const up = right0.map((v, i) => -Math.sin(ro) * v + Math.cos(ro) * up0[i])
const cam = [0, CAMERA_HEIGHT_M, 0]

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k]

/** Frame-space image point (frame heights, +y up) of a camera-relative vector. */
const frameOf = (d) => {
  const depth = dot(d, fwd)
  return [(f * dot(d, right)) / depth, (f * dot(d, up)) / depth]
}
const toPixel = ([x, y]) => [(x / ASPECT + 0.5) * WIDTH, (0.5 - y) * HEIGHT]
const toImageUV = ([x, y]) => [x / ASPECT + 0.5, 0.5 - y]

// ---- Scene: two boxes on a ground grid, aligned to directions A and B ----
const a = rad(TRUTH.gridYawDeg)
const dirA = [Math.sin(a), 0, -Math.cos(a)]
const dirB = [Math.cos(a), 0, Math.sin(a)]
const origin = [-1, 0, -24]
const at = (u, v, h) => add(add(add(origin, mul(dirA, u)), mul(dirB, v)), [0, h, 0])

const segments = [] // { p0, p1, shade, width }
const GRID_SHADE = 190
const EDGE_SHADE = 20
for (let k = -8; k <= 8; k += 2) {
  segments.push({ p0: at(-24, k, 0), p1: at(24, k, 0), shade: GRID_SHADE, width: 1 })
  segments.push({ p0: at(k, -24, 0), p1: at(k, 24, 0), shade: GRID_SHADE, width: 1 })
}
const box = (u0, u1, v0, v1, h) => {
  const c = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ]
  for (let i = 0; i < 4; i++) {
    const [ua, va] = c[i]
    const [ub, vb] = c[(i + 1) % 4]
    segments.push({ p0: at(ua, va, 0), p1: at(ub, vb, 0), shade: EDGE_SHADE, width: 3 })
    segments.push({ p0: at(ua, va, h), p1: at(ub, vb, h), shade: EDGE_SHADE, width: 3 })
    segments.push({ p0: at(ua, va, 0), p1: at(ua, va, h), shade: EDGE_SHADE, width: 3 })
  }
}
box(-3, 3, -4, 4, 6)
box(5, 8, -2, 2, 3)

// ---- Raster ----
const pixels = new Uint8Array(WIDTH * HEIGHT).fill(255)

/** Liang-Barsky clip of a 2D segment to the image rectangle. */
function clip2d([x0, y0], [x1, y1]) {
  let t0 = 0
  let t1 = 1
  const dx = x1 - x0
  const dy = y1 - y0
  const checks = [
    [-dx, x0],
    [dx, WIDTH - 1 - x0],
    [-dy, y0],
    [dy, HEIGHT - 1 - y0],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null
    } else {
      const r = q / p
      if (p < 0) {
        if (r > t1) return null
        if (r > t0) t0 = r
      } else {
        if (r < t0) return null
        if (r < t1) t1 = r
      }
    }
  }
  return [
    [x0 + t0 * dx, y0 + t0 * dy],
    [x0 + t1 * dx, y0 + t1 * dy],
  ]
}

function plot(x, y, shade, width) {
  const r = Math.floor(width / 2)
  for (let oy = -r; oy <= r; oy++)
    for (let ox = -r; ox <= r; ox++) {
      const px = Math.round(x) + ox
      const py = Math.round(y) + oy
      if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) pixels[py * WIDTH + px] = Math.min(pixels[py * WIDTH + px], shade)
    }
}

function drawLine([x0, y0], [x1, y1], shade, width) {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps
    plot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, shade, width)
  }
}

for (const s of segments) {
  // Clip to the near plane in camera depth first, then to the image.
  let d0 = sub(s.p0, cam)
  let d1 = sub(s.p1, cam)
  const z0 = dot(d0, fwd)
  const z1 = dot(d1, fwd)
  if (z0 < NEAR_M && z1 < NEAR_M) continue
  if (z0 < NEAR_M) d0 = add(d1, mul(sub(d0, d1), (z1 - NEAR_M) / (z1 - z0)))
  else if (z1 < NEAR_M) d1 = add(d0, mul(sub(d1, d0), (z0 - NEAR_M) / (z0 - z1)))
  const seg = clip2d(toPixel(frameOf(d0)), toPixel(frameOf(d1)))
  if (seg) drawLine(seg[0], seg[1], s.shade, s.width)
}

// ---- PNG (8-bit grayscale) ----
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}
const header = Buffer.alloc(13)
header.writeUInt32BE(WIDTH, 0)
header.writeUInt32BE(HEIGHT, 4)
header[8] = 8 // bit depth
header[9] = 0 // grayscale
const raw = Buffer.alloc((WIDTH + 1) * HEIGHT) // each scanline starts with filter byte 0
for (let y = 0; y < HEIGHT; y++) Buffer.from(pixels.buffer, y * WIDTH, WIDTH).copy(raw, y * (WIDTH + 1) + 1)
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(join(here, 'synthetic-2pt.png'), png)

// ---- Exact cues (image space) ----
const vp = (dir) => toImageUV(frameOf(dir))
// Horizon: n . p = d with n = (sin roll, cos roll), d = -f tan(pitch); two points a quarter frame either side of centre.
const d = -f * Math.tan(th)
const onHorizon = (x) => [x, (d - Math.sin(ro) * x) / Math.cos(ro)]
const round = (p) => p.map((v) => Math.round(v * 1e9) / 1e9)
const cues = {
  horizon: [round(toImageUV(onHorizon(-0.25))), round(toImageUV(onHorizon(0.25)))],
  vps: [round(vp(dirA)), round(vp(dirB))],
}
writeFileSync(
  join(here, 'synthetic-2pt.json'),
  JSON.stringify({ image: { file: 'synthetic-2pt.png', width: WIDTH, height: HEIGHT }, truth: TRUTH, cues, directions: { A: dirA, B: dirB } }, null, 2) + '\n',
)
console.log('wrote synthetic-2pt.png and synthetic-2pt.json', cues)
