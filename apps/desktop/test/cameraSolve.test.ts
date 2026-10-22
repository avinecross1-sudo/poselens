import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { imageToFrame } from '../src/lib/sketchSpace'
import { degToRad, radToDeg } from '../src/lib/units'
import {
  applySolution,
  focalFromVps,
  HORIZON_VP_TOLERANCE,
  lineThrough,
  pitchFromHorizonOffset,
  rollFromHorizon,
  solveCamera,
  solveFromSketch,
  SUGGESTED_FOCAL_RANGE_MM,
  type CameraSolution,
  type SolveInput,
} from '../src/solve/cameraSolve'
import { defaultCamera, defaultSketch } from '../src/state/defaults'
import fixtureJson from './fixtures/synthetic-2pt.json'
import { applyShotCamera } from '../src/three/cameraRig'
import type { SketchMeta, Vec2 } from '../src/types/scene'

const SENSOR = 24

// ---- An independent pinhole model that produces exact cues for a known camera ----
type V3 = [number, number, number]
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function cuesFor(pitchDeg: number, rollDeg: number, focalMm: number, yawDeg: number) {
  const f = focalMm / SENSOR
  const th = degToRad(pitchDeg)
  const ro = degToRad(rollDeg)
  const fwd: V3 = [0, Math.sin(th), -Math.cos(th)]
  const up0: V3 = [0, Math.cos(th), Math.sin(th)]
  const right: V3 = [Math.cos(ro), 0, 0].map((v, i) => v + Math.sin(ro) * up0[i]!) as V3
  const up: V3 = [-Math.sin(ro), 0, 0].map((v, i) => v + Math.cos(ro) * up0[i]!) as V3
  const project = (d: V3): Vec2 => [(f * dot3(d, right)) / dot3(d, fwd), (f * dot3(d, up)) / dot3(d, fwd)]
  const a = degToRad(yawDeg)
  const horizonOffset = -f * Math.tan(th)
  const onHorizon = (x: number): Vec2 => [x, (horizonOffset - Math.sin(ro) * x) / Math.cos(ro)]
  return {
    horizon: [onHorizon(-0.3), onHorizon(0.3)] as [Vec2, Vec2],
    vp1: project([Math.sin(a), 0, -Math.cos(a)]),
    vp2: project([Math.cos(a), 0, Math.sin(a)]),
    vertical: project([0, 1, 0]),
  }
}

const input = (over: Partial<SolveInput>): SolveInput => ({ horizon: null, vps: [], sensorHeightMm: SENSOR, currentFocalMm: 50, ...over })
const solved = (r: ReturnType<typeof solveCamera>): CameraSolution => {
  if (!r.ok) throw new Error(r.reason)
  return r.solution
}

describe('camera solve math', () => {
  it('derives roll from the horizon angle (CameraState.roll sense)', () => {
    const level = lineThrough([-1, 0], [1, 0])!
    expect(rollFromHorizon(level)).toBeCloseTo(0, 12)
    // Rising to the right at +5 degrees means the camera is rolled by -5 degrees.
    const rising = lineThrough([-1, -Math.tan(degToRad(5))], [1, Math.tan(degToRad(5))])!
    expect(radToDeg(rollFromHorizon(rising))).toBeCloseTo(-5, 9)
    // Point order does not matter.
    const reversed = lineThrough([1, Math.tan(degToRad(5))], [-1, -Math.tan(degToRad(5))])!
    expect(rollFromHorizon(reversed)).toBeCloseTo(rollFromHorizon(rising), 12)
  })

  it('derives pitch from the horizon offset: horizon above centre means looking down', () => {
    expect(pitchFromHorizonOffset(0, 1)).toBeCloseTo(0, 12)
    expect(pitchFromHorizonOffset(0.2, 1.5)).toBeLessThan(0)
    expect(pitchFromHorizonOffset(-0.2, 1.5)).toBeGreaterThan(0)
    expect(pitchFromHorizonOffset(-Math.tan(degToRad(15)) * 1.2, 1.2)).toBeCloseTo(degToRad(15), 12)
  })

  it('gets focal length from two orthogonal VPs', () => {
    expect(focalFromVps([-1, 0], [1, 0])).toBeCloseTo(1, 12)
    expect(focalFromVps([-2, 0], [0.5, 0])).toBeCloseTo(1, 12) // sqrt(d1 * d2), the spec formula
    // Off-level horizon: f^2 = a^2 - h^2, not the d1*d2 = a^2 + h^2 the spec formula would give.
    expect(focalFromVps([-2, 0.5], [2, 0.5])).toBeCloseTo(Math.sqrt(4 - 0.25), 12)
    // Frame centre outside the VPs: not orthogonal directions.
    expect(focalFromVps([1, 0], [2, 0])).toBeNull()
  })

  it('recovers pitch, roll and focal exactly from exact cues across many cameras', () => {
    for (const pitch of [-35, -10, 0, 12, 30])
      for (const roll of [-15, 0, 4, 20])
        for (const focal of [18, 28, 50, 85])
          for (const yaw of [25, 50, 65]) {
            const c = cuesFor(pitch, roll, focal, yaw)
            const r = solveCamera(input({ horizon: c.horizon, vps: [c.vp1, c.vp2] }))
            const s = solved(r)
            expect(radToDeg(s.pitch)).toBeCloseTo(pitch, 6)
            expect(radToDeg(s.roll)).toBeCloseTo(roll, 6)
            expect(s.focalMm).toBeCloseTo(focal, 5)
            expect(s.focalSolved).toBe(true)
            expect(s.confidence).toBe('green')
            expect(s.warnings).toEqual([])
            expect(s.focalRangeMm[0]).toBeLessThan(focal)
            expect(s.focalRangeMm[1]).toBeGreaterThan(focal)
          }
  })

  it('uses a consistent vertical VP as a cross-check without warnings', () => {
    const c = cuesFor(-20, 3, 35, 40)
    const s = solved(solveCamera(input({ horizon: c.horizon, vps: [c.vp1, c.vp2, c.vertical] })))
    expect(s.warnings).toEqual([])
    expect(s.confidence).toBe('green')
  })

  it('warns when the vertical VP contradicts the other cues', () => {
    const c = cuesFor(-20, 3, 35, 40)
    const bad: Vec2 = [c.vertical[0] + 3, c.vertical[1]]
    const s = solved(solveCamera(input({ horizon: c.horizon, vps: [c.vp1, c.vp2, bad] })))
    expect(s.confidence).toBe('yellow')
    expect(s.warnings.some((w) => /vertical VP/i.test(w))).toBe(true)
  })

  it('falls back to a suggested focal range with one VP, or none', () => {
    const c = cuesFor(-15, 2, 50, 40)
    for (const vps of [[], [c.vp1]]) {
      const s = solved(solveCamera(input({ horizon: c.horizon, vps, currentFocalMm: 50 })))
      expect(s.focalSolved).toBe(false)
      expect(s.focalRangeMm).toEqual([...SUGGESTED_FOCAL_RANGE_MM])
      expect(s.focalMm).toBe(50)
      expect(s.confidence).toBe('yellow')
      expect(radToDeg(s.roll)).toBeCloseTo(2, 6)
      // Pitch at the assumed focal is exact; the range brackets it.
      expect(radToDeg(s.pitch)).toBeCloseTo(-15, 6)
      expect(s.pitchRange[0]).toBeLessThanOrEqual(s.pitch)
      expect(s.pitchRange[1]).toBeGreaterThanOrEqual(s.pitch)
    }
    // A current focal outside the suggested range is pulled into it.
    expect(solved(solveCamera(input({ horizon: c.horizon, currentFocalMm: 300 }))).focalMm).toBe(SUGGESTED_FOCAL_RANGE_MM[1])
  })

  it('takes the horizon from two VPs when none is placed, with a note', () => {
    const c = cuesFor(-10, 5, 35, 45)
    const s = solved(solveCamera(input({ vps: [c.vp1, c.vp2] })))
    expect(s.horizonSource).toBe('vps')
    expect(radToDeg(s.roll)).toBeCloseTo(5, 6)
    expect(radToDeg(s.pitch)).toBeCloseTo(-10, 6)
    expect(s.confidence).toBe('yellow')
    expect(s.warnings[0]).toMatch(/No horizon placed/)
  })

  it('refuses to solve without a horizon or two VPs, or with degenerate points', () => {
    expect(solveCamera(input({})).ok).toBe(false)
    expect(solveCamera(input({ vps: [[1, 0]] })).ok).toBe(false)
    expect(solveCamera(input({ horizon: [[0.1, 0.1], [0.1, 0.1]] })).ok).toBe(false)
    expect(solveCamera(input({ horizon: [[0.1, -0.3], [0.1, 0.3]] })).ok).toBe(false) // vertical
  })

  it('warns when VPs are off the horizon', () => {
    const c = cuesFor(-10, 0, 35, 45)
    const nudge = HORIZON_VP_TOLERANCE * 1.5
    const s = solved(solveCamera(input({ horizon: c.horizon, vps: [[c.vp1[0], c.vp1[1] + nudge], c.vp2] })))
    expect(s.confidence).toBe('yellow')
    expect(s.warnings.some((w) => /VP 1.*off the horizon/.test(w))).toBe(true)
    const far = solved(solveCamera(input({ horizon: c.horizon, vps: [[c.vp1[0], c.vp1[1] + nudge * 4], c.vp2] })))
    expect(far.confidence).toBe('red')
  })

  it('flags VPs on the same side of the frame centre as inconsistent', () => {
    const s = solved(solveCamera(input({ horizon: [[-0.3, 0], [0.3, 0]], vps: [[1.5, 0], [3, 0]] })))
    expect(s.focalSolved).toBe(false)
    expect(s.confidence).toBe('red')
    expect(s.warnings.some((w) => /outside the two VPs/.test(w))).toBe(true)
  })

  it('warns about, and clamps, focal lengths outside 8-300 mm', () => {
    const wide = solved(solveCamera(input({ horizon: [[-0.3, 0], [0.3, 0]], vps: [[-0.1, 0], [0.1, 0]] }))) // f = 0.1 -> 2.4 mm
    expect(wide.focalMm).toBeCloseTo(2.4, 9)
    expect(wide.confidence).toBe('red')
    expect(wide.warnings.some((w) => /clamped/.test(w))).toBe(true)
    expect(applySolution(defaultCamera(), wide).focal).toBe(8)
    const tele = solved(solveCamera(input({ horizon: [[-0.3, 0], [0.3, 0]], vps: [[-20, 0], [20, 0]] }))) // f = 20 -> 480 mm
    expect(tele.confidence).toBe('red')
    expect(applySolution(defaultCamera(), tele).focal).toBe(300)
  })
})

describe('solving from sketch metadata (image space + alignment)', () => {
  const frameAspect = 2 / 3
  const imageAspect = 0.8
  const truthCues = cuesFor(-12, 6, 40, 50)

  /** Builds a sketch whose cues are the truth cues expressed in image space under `alignment`. */
  function sketchWith(alignment: SketchMeta['alignment']): SketchMeta {
    const toImage = (p: Vec2): Vec2 => {
      // Inverse of imageToFrame, by solving with the forward map (kept independent of frameToImage).
      const c = Math.cos(alignment.rotation)
      const s = Math.sin(alignment.rotation)
      const size = imageAspect >= frameAspect ? { w: frameAspect, h: frameAspect / imageAspect } : { w: imageAspect, h: 1 }
      const dx = p[0] - alignment.x
      const dy = p[1] - alignment.y
      const lx = dx * c + dy * s
      const ly = -dx * s + dy * c
      return [lx / (size.w * alignment.scale) + 0.5, 0.5 - ly / (size.h * alignment.scale)]
    }
    return {
      ...defaultSketch(),
      hash: 'sha256:test',
      size: { width: 800, height: 1000 },
      alignment,
      horizon: [toImage(truthCues.horizon[0]), toImage(truthCues.horizon[1])],
      vps: [toImage(truthCues.vp1), toImage(truthCues.vp2)],
    }
  }

  it('solves the same camera whatever the sketch scale, rotation and pan', () => {
    for (const alignment of [
      { x: 0, y: 0, scale: 1, rotation: 0 },
      { x: 0.2, y: -0.1, scale: 0.35, rotation: 0 },
      { x: -0.05, y: 0.3, scale: 1.4, rotation: degToRad(3) },
    ]) {
      const s = solved(solveFromSketch(sketchWith(alignment), defaultCamera(), frameAspect))
      // The cues were built from frame-space truth, so moving the sketch under them must not change the answer.
      expect(radToDeg(s.pitch)).toBeCloseTo(-12, 6)
      expect(radToDeg(s.roll)).toBeCloseTo(6, 6)
      expect(s.focalMm).toBeCloseTo(40, 5)
    }
  })

  it('needs an imported sketch', () => {
    expect(solveFromSketch(defaultSketch(), defaultCamera(), frameAspect).ok).toBe(false)
  })

  it('maps through imageToFrame as the layer draws it', () => {
    const a = { x: 0.1, y: 0.2, scale: 0.5, rotation: degToRad(10) }
    const p = imageToFrame([0.5, 0.5], a, imageAspect, frameAspect)
    expect(p[0]).toBeCloseTo(0.1, 12)
    expect(p[1]).toBeCloseTo(0.2, 12)
  })
})

describe('synthetic fixture (test/fixtures/synthetic-2pt)', () => {
  const fixture = fixtureJson as unknown as {
    image: { file: string; width: number; height: number }
    truth: { pitchDeg: number; rollDeg: number; focalMm: number; sensorHeightMm: number; gridYawDeg: number }
    cues: { horizon: [Vec2, Vec2]; vps: Vec2[] }
    directions: { A: V3; B: V3 }
  }
  const frameAspect = fixture.image.width / fixture.image.height
  const sketch: SketchMeta = {
    ...defaultSketch(),
    hash: 'sha256:fixture',
    size: { width: fixture.image.width, height: fixture.image.height },
    horizon: fixture.cues.horizon,
    vps: fixture.cues.vps,
  }

  it('recovers the camera the sketch was drawn with', () => {
    const s = solved(solveFromSketch(sketch, defaultCamera(), frameAspect))
    expect(radToDeg(s.pitch)).toBeCloseTo(fixture.truth.pitchDeg, 4)
    expect(radToDeg(s.roll)).toBeCloseTo(fixture.truth.rollDeg, 4)
    expect(s.focalMm).toBeCloseTo(fixture.truth.focalMm, 3)
    expect(s.confidence).toBe('green')
  })

  it('tolerates hand-placement error: cues off by about 1% of the frame still land close', () => {
    const jitter = (p: Vec2, i: number): Vec2 => [p[0] + 0.008 * Math.sin(i * 7.1), p[1] + 0.008 * Math.cos(i * 3.3)]
    const noisy: SketchMeta = {
      ...sketch,
      horizon: [jitter(sketch.horizon![0], 1), jitter(sketch.horizon![1], 2)],
      vps: sketch.vps.map((p, i) => jitter(p, i + 3)),
    }
    const s = solved(solveFromSketch(noisy, defaultCamera(), frameAspect))
    expect(Math.abs(radToDeg(s.roll) - fixture.truth.rollDeg)).toBeLessThan(2)
    expect(Math.abs(radToDeg(s.pitch) - fixture.truth.pitchDeg)).toBeLessThan(3)
    expect(Math.abs(s.focalMm - fixture.truth.focalMm) / fixture.truth.focalMm).toBeLessThan(0.25)
  })

  it('produces a camera whose real Three.js render lines up with the placed cues', () => {
    const s = solved(solveFromSketch(sketch, defaultCamera(), frameAspect))
    const state = applySolution(defaultCamera(), s)
    const cam = new THREE.PerspectiveCamera()
    applyShotCamera(cam, state, frameAspect)

    /** Frame-space position (frame heights, +y up) of a point at infinity along a world direction. */
    const projectDirection = (d: V3): Vec2 => {
      const far = 1e6
      const p = new THREE.Vector3(...state.position).add(new THREE.Vector3(...d).multiplyScalar(far)).project(cam)
      return [(p.x * frameAspect) / 2, p.y / 2]
    }
    const toFrame = (p: Vec2): Vec2 => imageToFrame(p, sketch.alignment, fixture.image.width / fixture.image.height, frameAspect)

    // The two horizontal directions of the drawn boxes vanish where the user placed VP 1 and VP 2.
    const vp1 = toFrame(fixture.cues.vps[0]!)
    const vp2 = toFrame(fixture.cues.vps[1]!)
    expect(projectDirection(fixture.directions.A)[0]).toBeCloseTo(vp1[0], 3)
    expect(projectDirection(fixture.directions.A)[1]).toBeCloseTo(vp1[1], 3)
    expect(projectDirection(fixture.directions.B)[0]).toBeCloseTo(vp2[0], 3)
    expect(projectDirection(fixture.directions.B)[1]).toBeCloseTo(vp2[1], 3)

    // Every horizontal direction vanishes on the placed horizon line.
    const [h0, h1] = [toFrame(fixture.cues.horizon[0]), toFrame(fixture.cues.horizon[1])]
    const hl = lineThrough(h0, h1)!
    for (let deg = 0; deg < 180; deg += 17) {
      const a = degToRad(deg)
      const p = projectDirection([Math.sin(a), 0, -Math.cos(a)])
      expect(Math.abs(hl.n[0] * p[0] + hl.n[1] * p[1] - hl.d)).toBeLessThan(2e-3)
    }

    // And the camera is not locked: position and target are plain editable values.
    expect(state.preset).toBe('custom')
    expect(state.position).toEqual(defaultCamera().position)
  })
})
