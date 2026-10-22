// Sketch landmarks: what the artist marks on the drawing, in guided-checklist order, and which
// mannequin node each one stands for. Landmarks are stored in image space (sketch.landmarks).
import type { JointName } from '../types/scene'

export const REQUIRED_LANDMARKS = [
  'head',
  'chin',
  'neck',
  'shoulderL',
  'shoulderR',
  'elbowL',
  'elbowR',
  'wristL',
  'wristR',
  'hipL',
  'hipR',
  'kneeL',
  'kneeR',
  'ankleL',
  'ankleR',
  'toeL',
  'toeR',
] as const

export const OPTIONAL_LANDMARKS = ['chest', 'waist', 'gaze'] as const

export const LANDMARK_IDS = [...REQUIRED_LANDMARKS, ...OPTIONAL_LANDMARKS] as const
export type LandmarkId = (typeof LANDMARK_IDS)[number]

export const isLandmarkId = (k: string): k is LandmarkId => (LANDMARK_IDS as readonly string[]).includes(k)

export interface LandmarkDef {
  label: string
  /** What to click on the drawing. */
  hint: string
  /** The mannequin node the landmark belongs to (confidence is reported on it). */
  joint: JointName
  /** Landmarks on a limb or the torso can carry a toward/away-from-viewer hint for the depth resolve. */
  depthHint: boolean
}

export const LANDMARKS: Record<LandmarkId, LandmarkDef> = {
  head: { label: 'Top of head', hint: 'The crown, at the top of the skull', joint: 'head', depthHint: true },
  chin: { label: 'Chin', hint: 'The bottom of the chin', joint: 'head', depthHint: false },
  neck: { label: 'Neck base', hint: 'Where the neck meets the shoulders, at the pit of the throat', joint: 'neck', depthHint: true },
  shoulderL: { label: 'Left shoulder', hint: "The figure's left shoulder ball (the top of the arm)", joint: 'upperArmL', depthHint: true },
  shoulderR: { label: 'Right shoulder', hint: "The figure's right shoulder ball", joint: 'upperArmR', depthHint: true },
  elbowL: { label: 'Left elbow', hint: 'The centre of the left elbow', joint: 'forearmL', depthHint: true },
  elbowR: { label: 'Right elbow', hint: 'The centre of the right elbow', joint: 'forearmR', depthHint: true },
  wristL: { label: 'Left wrist', hint: 'The centre of the left wrist', joint: 'handL', depthHint: true },
  wristR: { label: 'Right wrist', hint: 'The centre of the right wrist', joint: 'handR', depthHint: true },
  hipL: { label: 'Left hip', hint: 'The left hip joint (top of the thigh, not the hip bone)', joint: 'thighL', depthHint: true },
  hipR: { label: 'Right hip', hint: 'The right hip joint', joint: 'thighR', depthHint: true },
  kneeL: { label: 'Left knee', hint: 'The centre of the left knee', joint: 'shinL', depthHint: true },
  kneeR: { label: 'Right knee', hint: 'The centre of the right knee', joint: 'shinR', depthHint: true },
  ankleL: { label: 'Left ankle', hint: 'The centre of the left ankle', joint: 'footL', depthHint: true },
  ankleR: { label: 'Right ankle', hint: 'The centre of the right ankle', joint: 'footR', depthHint: true },
  toeL: { label: 'Left toes', hint: 'The ball of the left foot, where the toes bend (sets toe direction)', joint: 'toeL', depthHint: true },
  toeR: { label: 'Right toes', hint: 'The ball of the right foot (sets toe direction)', joint: 'toeR', depthHint: true },
  chest: { label: 'Chest (optional)', hint: 'Mid-chest on the spine line, level with the bottom of the ribcage', joint: 'chest', depthHint: false },
  waist: { label: 'Waist (optional)', hint: 'The waist on the spine line, just above the hips', joint: 'spine', depthHint: false },
  gaze: { label: 'Gaze (optional)', hint: 'A point the figure is looking at (sets which way the head turns)', joint: 'head', depthHint: false },
}

/** A joint is nearer the viewer ('toward') or farther ('away') than the joint it hangs from. */
export type DepthHint = 'toward' | 'away'
export const isDepthHint = (v: unknown): v is DepthHint => v === 'toward' || v === 'away'

/** First required landmark not yet placed, else the first missing optional one, else null. */
export function nextLandmark(placed: Readonly<Record<string, unknown>>, after?: LandmarkId): LandmarkId | null {
  const start = after ? LANDMARK_IDS.indexOf(after) + 1 : 0
  const order = [...LANDMARK_IDS.slice(start), ...LANDMARK_IDS.slice(0, start)]
  const required = order.find((id) => (REQUIRED_LANDMARKS as readonly string[]).includes(id) && placed[id] === undefined)
  return required ?? order.find((id) => placed[id] === undefined) ?? null
}

/** Stick-figure lines drawn between placed landmarks in the overlay. */
export const LANDMARK_BONES: readonly (readonly [LandmarkId, LandmarkId])[] = [
  ['head', 'chin'],
  ['chin', 'neck'],
  ['neck', 'shoulderL'],
  ['neck', 'shoulderR'],
  ['shoulderL', 'elbowL'],
  ['elbowL', 'wristL'],
  ['shoulderR', 'elbowR'],
  ['elbowR', 'wristR'],
  ['neck', 'chest'],
  ['chest', 'waist'],
  ['hipL', 'hipR'],
  ['hipL', 'kneeL'],
  ['kneeL', 'ankleL'],
  ['ankleL', 'toeL'],
  ['hipR', 'kneeR'],
  ['kneeR', 'ankleR'],
  ['ankleR', 'toeR'],
]
