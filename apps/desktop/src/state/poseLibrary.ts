// Pose presets from /seeds/pose-library.json (bundled at build time, read-only).
import libraryJson from '@seeds/pose-library.json'
import { degToRad } from '../lib/units'
import { HAND_SHAPES, JOINT_NAMES, type HandShape, type JointName, type JointRotation, type Side } from '../types/scene'

interface SeedPose {
  id: string
  name: string
  tags: string[]
  joints?: Partial<Record<string, number[]>>
  hands?: Partial<Record<Side, string>>
  lift?: number
}

export interface LibraryPose {
  id: string
  name: string
  tags: string[]
  /** Radians, every joint present. */
  joints: Record<JointName, JointRotation>
  hands: Record<Side, HandShape>
  /** Meters above the ground for the lowest body point (0 = grounded). */
  lift: number
}

const DEFAULT_HAND: HandShape = 'relaxed'
const handShape = (v: string | undefined): HandShape =>
  HAND_SHAPES.includes(v as HandShape) ? (v as HandShape) : DEFAULT_HAND

function toLibraryPose(p: SeedPose): LibraryPose {
  const joints = Object.fromEntries(
    JOINT_NAMES.map((j) => {
      const d = p.joints?.[j] ?? []
      return [j, { rx: degToRad(d[0] ?? 0), ry: degToRad(d[1] ?? 0), rz: degToRad(d[2] ?? 0) }]
    }),
  ) as Record<JointName, JointRotation>
  return {
    id: p.id,
    name: p.name,
    tags: [...p.tags],
    joints,
    hands: { L: handShape(p.hands?.L), R: handShape(p.hands?.R) },
    lift: p.lift ?? 0,
  }
}

export const POSE_LIBRARY: readonly LibraryPose[] = (libraryJson as { poses: SeedPose[] }).poses.map(toLibraryPose)

export const POSE_TAGS: readonly string[] = [...new Set(POSE_LIBRARY.flatMap((p) => p.tags))].sort()

export const getLibraryPose = (id: string): LibraryPose | undefined => POSE_LIBRARY.find((p) => p.id === id)

/** Case-insensitive match on name, id or tag; every whitespace-separated word must match. */
export function searchPoses(
  query: string,
  opts: { tag?: string | null; favoritesOnly?: boolean; favorites?: readonly string[] } = {},
): LibraryPose[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return POSE_LIBRARY.filter((p) => {
    if (opts.tag && !p.tags.includes(opts.tag)) return false
    if (opts.favoritesOnly && !(opts.favorites ?? []).includes(p.id)) return false
    const hay = `${p.name} ${p.id} ${p.tags.join(' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
