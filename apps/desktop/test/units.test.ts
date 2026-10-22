import { describe, expect, it } from 'vitest'
import { clamp, degToRad, focalToVerticalFov, radToDeg, verticalFovToFocal } from '../src/lib/units'

describe('units', () => {
  it('converts degrees and radians both ways', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI)
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90)
    expect(radToDeg(degToRad(37.5))).toBeCloseTo(37.5)
  })

  it('computes vertical FOV from focal length and 24 mm sensor', () => {
    // 24 mm sensor at 12 mm focal -> half-angle 45°
    expect(radToDeg(focalToVerticalFov(12, 24))).toBeCloseTo(90)
    // 50 mm full-frame vertical FOV ≈ 26.99°
    expect(radToDeg(focalToVerticalFov(50, 24))).toBeCloseTo(26.99, 1)
  })

  it('longer focal length gives narrower FOV', () => {
    expect(focalToVerticalFov(200, 24)).toBeLessThan(focalToVerticalFov(35, 24))
  })

  it('inverts focal <-> fov', () => {
    for (const f of [8, 24, 50, 135, 300]) expect(verticalFovToFocal(focalToVerticalFov(f, 24), 24)).toBeCloseTo(f)
  })

  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })
})
