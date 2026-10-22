import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createAnatomyLayer } from '../src/three/anatomy/anatomyLayer'
import { DEFAULT_PROFILE, MUSCLE_COLORS, MUSCLES, placeMuscles, spindleRadius } from '../src/three/anatomy/muscles'
import { computeRig } from '../src/three/bodyRig'
import { createMannequin } from '../src/three/mannequin'
import { NEUTRAL_SLIDERS } from '../src/state/bodySliders'
import { JOINT_NAMES } from '../src/types/scene'
import schema from '../../../docs/anatomy-schema.json'

const restRig = computeRig(NEUTRAL_SLIDERS)
const byId = (rig = restRig) => new Map(placeMuscles(rig).map((m) => [m.id, m]))

describe('muscle table', () => {
  it('places every form on a real bone with a unique id', () => {
    const all = placeMuscles(restRig)
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length)
    for (const m of all) expect(JOINT_NAMES).toContain(m.bone)
    expect(all.length).toBeGreaterThan(MUSCLES.length)
  })

  it('mirrors left and right forms across the mid-line', () => {
    const m = byId()
    for (const id of ['trap', 'deltoid', 'thigh', 'glute', 'biceps']) {
      const l = m.get(`${id}L`)!
      const r = m.get(`${id}R`)!
      expect(r.center[0]).toBeCloseTo(-l.center[0])
      expect(r.center[1]).toBeCloseTo(l.center[1])
      expect(r.size).toEqual(l.size)
      expect(r.rot[2]).toBeCloseTo(-l.rot[2])
    }
  })

  it('follows the length and girth sliders', () => {
    const rest = byId()
    const longLegs = byId(computeRig({ ...NEUTRAL_SLIDERS, legLength: NEUTRAL_SLIDERS.legLength * 1.2 }))
    const heavy = byId(computeRig({ ...NEUTRAL_SLIDERS, mass: NEUTRAL_SLIDERS.mass + 0.5 }))
    expect(longLegs.get('thighL')!.size[1]).toBeGreaterThan(rest.get('thighL')!.size[1])
    expect(heavy.get('ribcage')!.size[0]).toBeGreaterThan(rest.get('ribcage')!.size[0])
    expect(heavy.get('thighL')!.size[0]).toBeGreaterThan(rest.get('thighL')!.size[0])
  })
})

describe('spindle profile', () => {
  it('closes at both ends and is widest at the peak', () => {
    const p = { peak: 0.62, ends: 0.55 }
    expect(spindleRadius(0, p)).toBeCloseTo(0)
    expect(spindleRadius(1, p)).toBeCloseTo(0)
    expect(spindleRadius(0.62, p)).toBeCloseTo(0.5)
    expect(spindleRadius(0.4, DEFAULT_PROFILE)).toBeLessThan(0.5)
  })
})

describe('anatomy layer', () => {
  const setup = () => {
    const m = createMannequin()
    m.applyRig(restRig)
    const layer = createAnatomyLayer(m)
    layer.applyRig(restRig)
    return { m, layer }
  }
  const segment = (m: ReturnType<typeof createMannequin>, j: 'chest' | 'handL') =>
    m.nodes[j].children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.renderOrder !== 1)!

  it('hides grey segments and tints hands while on, and restores them when off', () => {
    const { m, layer } = setup()
    const chest = segment(m, 'chest')
    const palm = segment(m, 'handL')
    const palmMat = palm.material
    layer.setEnabled(true)
    expect(chest.visible).toBe(false)
    expect(palm.visible).toBe(true)
    expect(palm.material).not.toBe(palmMat)
    layer.setEnabled(false)
    expect(chest.visible).toBe(true)
    expect(palm.material).toBe(palmMat)
  })

  it('keeps selected joint markers visible and hides plain ones', () => {
    const { m, layer } = setup()
    layer.setEnabled(true)
    m.setSelected('forearmL')
    layer.enforce()
    const marker = (j: 'forearmL' | 'forearmR') => m.nodes[j].children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.renderOrder === 1)!
    expect(marker('forearmL').visible).toBe(true)
    expect(marker('forearmR').visible).toBe(false)
  })

  it('poses with the skeleton', () => {
    const { m, layer } = setup()
    layer.setEnabled(true)
    const elbow = m.nodes.forearmL.getObjectByName('elbowL')!
    m.root.updateMatrixWorld(true)
    const before = elbow.getWorldPosition(new THREE.Vector3())
    m.nodes.upperArmL.rotation.z = Math.PI / 2
    m.root.updateMatrixWorld(true)
    const after = elbow.getWorldPosition(new THREE.Vector3())
    expect(after.x).toBeGreaterThan(before.x + 0.1)
  })
})

describe('anatomy schema (docs/anatomy-schema.json)', () => {
  it('lists the same colour groups and bones as the code', () => {
    expect([...schema.$defs.colorGroup.enum].sort()).toEqual(Object.keys(MUSCLE_COLORS).sort())
    for (const m of MUSCLES) {
      expect(schema.$defs.bone.enum).toContain(m.bone)
      expect(m.id).toMatch(new RegExp(schema.$defs.block.properties.id.pattern))
      expect(m.size.every((v) => v > 0)).toBe(true)
    }
  })
})
