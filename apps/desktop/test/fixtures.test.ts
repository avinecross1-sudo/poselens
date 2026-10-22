/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/synthetic-2pt.json'

describe('synthetic sketch fixture', () => {
  it('ships a PNG of the size the cue file states', () => {
    const png = readFileSync(join(__dirname, 'fixtures', fixture.image.file))
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.readUInt32BE(16)).toBe(fixture.image.width)
    expect(png.readUInt32BE(20)).toBe(fixture.image.height)
  })
})
