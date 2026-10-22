import { describe, expect, it } from 'vitest'
import {
  cameraFromControls,
  controlsFromCamera,
  MAX_PITCH_RAD,
  setDistance,
  setHeight,
  setPitch,
  setTargetHeight,
  setYaw,
} from '../src/lib/cameraMath'
import { degToRad } from '../src/lib/units'
import type { Vec3 } from '../src/types/scene'

const expectVec = (a: Vec3, b: Vec3): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] ?? NaN, 9))

describe('cameraMath', () => {
  const position: Vec3 = [1.2, 1.6, 3.4]
  const target: Vec3 = [0.2, 1.0, -0.3]

  it('controls -> camera -> controls round-trips', () => {
    const c = controlsFromCamera(position, target)
    const back = cameraFromControls(c, target)
    expectVec(back.position, position)
    expectVec(back.target, target)
  })

  it('yaw 0 puts the camera on +Z of the target', () => {
    const c = controlsFromCamera([0, 1, 5], [0, 1, 0])
    expect(c.yaw).toBeCloseTo(0)
    expect(c.pitch).toBeCloseTo(0)
    expect(c.distance).toBeCloseTo(5)
  })

  it('pitch is negative when looking down', () => {
    expect(controlsFromCamera([0, 3, 3], [0, 0, 0]).pitch).toBeCloseTo(-Math.PI / 4)
  })

  it('setYaw orbits at constant height and distance', () => {
    const r = setYaw(position, target, degToRad(90))
    const c0 = controlsFromCamera(position, target)
    const c1 = controlsFromCamera(r.position, r.target)
    expect(c1.yaw).toBeCloseTo(degToRad(90))
    expect(c1.distance).toBeCloseTo(c0.distance)
    expect(c1.height).toBeCloseTo(c0.height)
    expectVec(r.target, target)
  })

  it('setPitch keeps camera position and moves target height', () => {
    const r = setPitch(position, target, degToRad(-20))
    expectVec(r.position, position)
    expect(controlsFromCamera(r.position, r.target).pitch).toBeCloseTo(degToRad(-20))
  })

  it('setPitch clamps short of vertical', () => {
    const r = setPitch(position, target, degToRad(-89.9))
    expect(controlsFromCamera(r.position, r.target).pitch).toBeCloseTo(-MAX_PITCH_RAD)
  })

  it('setHeight and setTargetHeight move only y', () => {
    const h = setHeight(position, target, 2.5)
    expectVec(h.position, [position[0], 2.5, position[2]])
    expectVec(h.target, target)
    const t = setTargetHeight(position, target, 0.4)
    expectVec(t.target, [target[0], 0.4, target[2]])
    expectVec(t.position, position)
  })

  it('setDistance keeps both heights and yaw', () => {
    const r = setDistance(position, target, 9)
    const c0 = controlsFromCamera(position, target)
    const c1 = controlsFromCamera(r.position, r.target)
    expect(c1.distance).toBeCloseTo(9)
    expect(c1.height).toBeCloseTo(c0.height)
    expect(c1.targetHeight).toBeCloseTo(c0.targetHeight)
    expect(c1.yaw).toBeCloseTo(c0.yaw)
  })
})
