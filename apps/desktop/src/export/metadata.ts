// State <-> SceneV1 (docs/metadata-schema.md). Pure functions: no store, no I/O.
import {
  BODY_SLIDER_KEYS,
  HAND_SHAPES,
  JOINT_NAMES,
  SCHEMA_VERSION,
  type HandShape,
  type BalanceMeta,
  type BodySliders,
  type BodyState,
  type CameraState,
  type ExportSettings,
  type JointName,
  type JointRotation,
  type PoseState,
  type SceneV1,
  type SketchMeta,
  type Vec3,
} from '../types/scene'
import { defaultBody, defaultCamera, defaultExport, defaultPose, defaultScene } from '../state/defaults'
import type { Doc } from '../state/types'

export const APP_NAME = 'PoseLens' as const

export const emptySketch = (): SketchMeta => ({
  hash: null,
  path: null,
  alignment: { x: 0, y: 0, scale: 1, rotation: 0 },
  landmarks: {},
  horizon: null,
  vps: [],
  solve: { settings: {}, confidence: {}, baked: false },
})

export const emptyBalance = (): BalanceMeta => ({ com: null, supportPolygon: [], contacts: [], warnings: [] })

export const exportHeightPx = (widthPx: number, aspect: number): number => Math.max(1, Math.round(widthPx / aspect))

const clone = <T>(v: T): T => structuredClone(v)

/** Builds the file object. scene.canvasRatio is the single source for both aspect fields. */
export function toSceneV1(doc: Doc, exportSettings: ExportSettings, appVersion: string): SceneV1 {
  const aspect = doc.scene.canvasRatio
  const widthPx = exportSettings.settings.widthPx
  return {
    schemaVersion: SCHEMA_VERSION,
    app: { name: APP_NAME, version: appVersion },
    canvas: { aspect, widthPx, heightPx: exportHeightPx(widthPx, aspect) },
    scene: { groundPlane: doc.scene.groundPlane, grid: doc.scene.grid, horizon: doc.scene.horizon },
    body: clone(doc.body),
    pose: clone(doc.pose),
    camera: { ...clone(doc.camera), aspect },
    sketch: emptySketch(),
    balance: emptyBalance(),
    variants: [],
    export: clone(exportSettings),
    tags: [],
    notes: '',
  }
}

export class SceneFormatError extends Error {}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const vec3 = (v: unknown, fallback: Vec3): Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? [v[0] as number, v[1] as number, v[2] as number]
    : [...fallback]
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const numRecord = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(obj(v)).filter((e): e is [string, number] => typeof e[1] === 'number'))
const boolRecord = (v: unknown): Record<string, boolean> =>
  Object.fromEntries(Object.entries(obj(v)).filter((e): e is [string, boolean] => typeof e[1] === 'boolean'))

/**
 * Brings any supported file up to the current schema. Only v1 exists, so this is the hook
 * later versions extend (add `if (version === 1) raw = migrateV1toV2(raw)` etc).
 */
export function migrate(raw: unknown): Obj {
  if (!isObj(raw)) throw new SceneFormatError('Scene file is not a JSON object.')
  const version = raw['schemaVersion']
  if (typeof version !== 'number') throw new SceneFormatError('Scene file has no schemaVersion.')
  if (version > SCHEMA_VERSION) {
    throw new SceneFormatError(`Scene file is schema v${version}; this PoseLens reads up to v${SCHEMA_VERSION}.`)
  }
  if (version < 1) throw new SceneFormatError(`Unknown schema version ${version}.`)
  return raw
}

function readBody(v: unknown): BodyState {
  const d = defaultBody()
  const b = obj(v)
  const s = obj(b['sliders'])
  // Phase 1 files carry only the five overall sliders; the rest fall back to the default body,
  // whose extra sliders are neutral, so old files load exactly as they looked.
  const sliders = Object.fromEntries(BODY_SLIDER_KEYS.map((k) => [k, num(s[k], d.sliders[k])])) as BodySliders
  const so = b['stylizedOverride']
  return {
    presetId: str(b['presetId'], d.presetId),
    modifiedFrom: typeof b['modifiedFrom'] === 'string' ? b['modifiedFrom'] : null,
    sliders,
    locks: boolRecord(b['locks']),
    asymmetry: numRecord(b['asymmetry']),
    stylizedOverride:
      isObj(so) && Array.isArray(so['matrix'])
        ? { matrix: so['matrix'].filter((x): x is number => typeof x === 'number'), acknowledged: bool(so['acknowledged'], false) }
        : null,
  }
}

function readPose(v: unknown): PoseState {
  const d = defaultPose()
  const p = obj(v)
  const j = obj(p['joints'])
  const joints = {} as Record<JointName, JointRotation>
  for (const name of JOINT_NAMES) {
    const r = obj(j[name])
    joints[name] = { rx: num(r['rx'], 0), ry: num(r['ry'], 0), rz: num(r['rz'], 0) }
  }
  const rt = obj(p['rootTransform'])
  const h = obj(p['hands'])
  const hand = (v: unknown, fallback: HandShape): HandShape =>
    typeof v === 'string' && (HAND_SHAPES as readonly string[]).includes(v) ? (v as HandShape) : fallback
  return {
    joints,
    hands: { L: hand(h['L'], d.hands.L), R: hand(h['R'], d.hands.R) },
    rootTransform: { position: vec3(rt['position'], d.rootTransform.position), rotation: vec3(rt['rotation'], d.rootTransform.rotation) },
    ikLocks: strArray(p['ikLocks']),
    jointLocks: strArray(p['jointLocks']),
    depthNudges: numRecord(p['depthNudges']),
  }
}

function readCamera(v: unknown): CameraState {
  const d = defaultCamera()
  const c = obj(v)
  return {
    position: vec3(c['position'], d.position),
    target: vec3(c['target'], d.target),
    up: vec3(c['up'], d.up),
    focal: num(c['focal'], d.focal),
    sensorHeight: num(c['sensorHeight'], d.sensorHeight),
    roll: num(c['roll'], d.roll),
    preset: str(c['preset'], d.preset),
  }
}

function readExport(v: unknown): ExportSettings {
  const d = defaultExport()
  const e = obj(v)
  return {
    preset: str(e['preset'], d.preset),
    namingTemplate: str(e['namingTemplate'], d.namingTemplate),
    settings: { ...obj(e['settings']), widthPx: num(obj(e['settings'])['widthPx'], d.settings.widthPx) },
  }
}

/** Parses a scene.json or export.json. Missing fields fall back to defaults; canvas.aspect wins. */
export function fromSceneV1(raw: unknown): { doc: Doc; exportSettings: ExportSettings } {
  const file = migrate(raw)
  const ds = defaultScene()
  const canvas = obj(file['canvas'])
  const scene = obj(file['scene'])
  const camera = obj(file['camera'])
  const aspect = num(canvas['aspect'], num(camera['aspect'], ds.canvasRatio))
  const exportSettings = readExport(file['export'])
  if (typeof canvas['widthPx'] === 'number') exportSettings.settings.widthPx = num(canvas['widthPx'], exportSettings.settings.widthPx)
  return {
    doc: {
      scene: {
        canvasRatio: aspect > 0 ? aspect : ds.canvasRatio,
        groundPlane: bool(scene['groundPlane'], ds.groundPlane),
        grid: bool(scene['grid'], ds.grid),
        horizon: bool(scene['horizon'], ds.horizon),
      },
      body: readBody(file['body']),
      pose: readPose(file['pose']),
      camera: readCamera(file['camera']),
    },
    exportSettings,
  }
}
