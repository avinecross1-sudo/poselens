import { describe, expect, it } from 'vitest'
import { fitRect } from '../src/lib/frameLayout'
import { frameToImage, frameToPx, imageFrameSize, imageToFrame, pxToFrame, type SketchAlignment } from '../src/lib/sketchSpace'
import { degToRad } from '../src/lib/units'
import type { Vec2 } from '../src/types/scene'

describe('sketch coordinate spaces', () => {
  it('fits the image inside the frame (contain)', () => {
    expect(imageFrameSize(1, 2 / 3)).toEqual({ w: 2 / 3, h: 2 / 3 }) // square image in a portrait frame: width-limited
    expect(imageFrameSize(2 / 3, 2 / 3)).toEqual({ w: 2 / 3, h: 1 })
    expect(imageFrameSize(0.5, 2 / 3)).toEqual({ w: 0.5, h: 1 }) // narrower image: height-limited
  })

  it('maps the image centre to the alignment offset and corners symmetrically', () => {
    const a: SketchAlignment = { x: 0.1, y: -0.2, scale: 1, rotation: 0 }
    expect(imageToFrame([0.5, 0.5], a, 2 / 3, 2 / 3)).toEqual([0.1, -0.2])
    const tl = imageToFrame([0, 0], { x: 0, y: 0, scale: 1, rotation: 0 }, 2 / 3, 2 / 3)
    expect(tl[0]).toBeCloseTo(-1 / 3, 12) // left edge of the frame
    expect(tl[1]).toBeCloseTo(0.5, 12) // top edge: +y is up
  })

  it('rotates counter-clockwise about the sketch centre', () => {
    const a: SketchAlignment = { x: 0, y: 0, scale: 1, rotation: degToRad(90) }
    const right = imageToFrame([1, 0.5], a, 1, 1) // right-middle of a square sketch
    expect(right[0]).toBeCloseTo(0, 12)
    expect(right[1]).toBeCloseTo(0.5, 12) // swung up to the top
  })

  it('round-trips image <-> frame under any alignment', () => {
    const points: Vec2[] = [[0, 0], [0.3, 0.9], [1.7, -2.2], [-3, 4]]
    for (const a of [
      { x: 0, y: 0, scale: 1, rotation: 0 },
      { x: 0.3, y: -0.4, scale: 0.2, rotation: degToRad(37) },
      { x: -1, y: 1, scale: 5, rotation: degToRad(-170) },
    ]) {
      for (const p of points) {
        const back = frameToImage(imageToFrame(p, a, 0.8, 2 / 3), a, 0.8, 2 / 3)
        expect(back[0]).toBeCloseTo(p[0], 9)
        expect(back[1]).toBeCloseTo(p[1], 9)
      }
    }
  })

  it('round-trips frame <-> pixel and matches the frame rect', () => {
    const r = fitRect(1000, 700, 2 / 3, 24)
    expect(r.height).toBeCloseTo(652, 9)
    expect(r.width).toBeCloseTo((652 * 2) / 3, 9)
    const centre = frameToPx([0, 0], r)
    expect(centre[0]).toBeCloseTo(500, 9)
    expect(centre[1]).toBeCloseTo(350, 9)
    const top = frameToPx([0, 0.5], r)
    expect(top[1]).toBeCloseTo(r.top, 9)
    const p: Vec2 = [0.21, -0.33]
    const back = pxToFrame(frameToPx(p, r), r)
    expect(back[0]).toBeCloseTo(p[0], 12)
    expect(back[1]).toBeCloseTo(p[1], 12)
  })
})
