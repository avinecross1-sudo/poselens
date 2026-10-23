// State <-> SceneV1 (docs/metadata-schema.md). Pure functions: no store, no I/O.
import {
  BODY_SLIDER_KEYS,
  EXPORT_FRAMINGS,
  EXPORT_PRESETS,
  MAX_VPS,
  HAND_SHAPES,
  JOINT_NAMES,
  SCHEMA_VERSION,
  type HandShape,
  type BalanceMeta,
  type BodySliders,
  type BodyState,
  type CameraState,
  type ConfidenceLevel,
  type ExportFraming,
  type ExportPreset,
  type ExportSettings,
  type SceneMeta,
  type Variant,
  type JointName,
  type JointRotation,
  type PoseState,
  type SceneV1,
  type SketchMeta,
  type Vec2,
  type Vec3,
} from '../types/scene'
import { defaultBody, defaultCamera, defaultExport, defaultMeta, defaultPose, defaultScene, defaultSketch } from '../state/defaults'
import type { Doc } from '../state/types'
import { computeBalance } from '../lib/balance'
import { activeStylizeMatrix } from '../solve/fk'
import { computeRig } from '../three/bodyRig'
import { MAX_VARIANTS } from '../state/variantsSlice'

export const APP_NAME = 'PoseLens' as const

export const emptySketch = defaultSketch

export const emptyBalance = (): BalanceMeta => ({ com: null, supportPolygon: [], contacts: [], warnings: [] })

export const exportHeightPx = (widthPx: number, aspect: number): number => Math.max(1, Math.round(widthPx / aspect))

const clone = <T>(v: T): T => structuredClone(v)

/** Balance of the saved body + pose (balance-spec), as written to the file. Derived; ignored on load. */
export function balanceMeta(doc: Pick<Doc, 'body' | 'pose'>): BalanceMeta {
  const b = computeBalance({
    rig: computeRig(doc.body.sliders, doc.body.asymmetry),
    pose: doc.pose,
    sliders: doc.body.sliders,
    stylize: activeStylizeMatrix(doc.body.stylizedOverride),
  })
  return { com: b.com, supportPolygon: b.supportPolygon, contacts: b.contacts.map((c) => `${c.side}:${c.part}`), warnings: b.warnings }
}

/** Builds the file object. scene.canvasRatio is the single source for both aspect fields. */
export function toSceneV1(doc: Doc, exportSettings: ExportSettings, appVersion: string, sceneName?: string): SceneV1 {
  const aspect = doc.scene.canvasRatio
  const widthPx = exportSettings.settings.widthPx
  return {
    schemaVersion: SCHEMA_VERSION,
    app: { name: APP_NAME, version: appVersion },
    ...(sceneName !== undefined ? { name: sceneName } : {}),
    canvas: { aspect, widthPx, heightPx: exportHeightPx(widthPx, aspect) },
    scene: { groundPlane: doc.scene.groundPlane, grid: doc.scene.grid, horizon: doc.scene.horizon, groundShadow: doc.scene.groundShadow },
    body: clone(doc.body),
    pose: clone(doc.pose),
    camera: { ...clone(doc.camera), aspect },
    sketch: clone(doc.sketch),
    balance: balanceMeta(doc),
    variants: clone(doc.variants),
    export: clone(exportSettings),
    tags: [...doc.meta.tags],
    notes: doc.meta.notes,
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

const vec2 = (v: unknown): Vec2 | null =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0] as number, v[1] as number] : null

function readSketch(v: unknown): SketchMeta {
  const d = defaultSketch()
  const s = obj(v)
  const a = obj(s['alignment'])
  const size = obj(s['size'])
  const h = Array.isArray(s['horizon']) ? s['horizon'].map(vec2) : []
  const solve = obj(s['solve'])
  const level = (x: unknown): x is ConfidenceLevel => x === 'green' || x === 'yellow' || x === 'red'
  return {
    hash: typeof s['hash'] === 'string' ? s['hash'] : null,
    path: typeof s['path'] === 'string' ? s['path'] : null,
    size:
      typeof size['width'] === 'number' && typeof size['height'] === 'number' && size['width'] > 0 && size['height'] > 0
        ? { width: size['width'], height: size['height'] }
        : null,
    alignment: {
      x: num(a['x'], d.alignment.x),
      y: num(a['y'], d.alignment.y),
      scale: num(a['scale'], d.alignment.scale) > 0 ? num(a['scale'], d.alignment.scale) : d.alignment.scale,
      rotation: num(a['rotation'], d.alignment.rotation),
    },
    landmarks: Object.fromEntries(Object.entries(obj(s['landmarks'])).flatMap(([k, p]) => (vec2(p) ? [[k, vec2(p) as Vec2]] : []))),
    depthHints: Object.fromEntries(
      Object.entries(obj(s['depthHints'])).filter((e): e is [string, 'toward' | 'away'] => e[1] === 'toward' || e[1] === 'away'),
    ),
    horizon: h.length === 2 && h[0] && h[1] ? [h[0], h[1]] : null,
    vps: Array.isArray(s['vps']) ? s['vps'].map(vec2).filter((p): p is Vec2 => p !== null).slice(0, MAX_VPS) : [],
    solve: {
      settings: { ...obj(solve['settings']) },
      confidence: Object.fromEntries(Object.entries(obj(solve['confidence'])).filter((e): e is [string, ConfidenceLevel] => level(e[1]))),
      baked: bool(solve['baked'], false),
    },
  }
}

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback

function readExport(v: unknown): ExportSettings {
  const d = defaultExport()
  const e = obj(v)
  const o = obj(e['settings'])
  return {
    preset: oneOf<ExportPreset>(e['preset'], EXPORT_PRESETS, d.preset),
    namingTemplate: str(e['namingTemplate'], d.namingTemplate),
    settings: {
      widthPx: num(o['widthPx'], d.settings.widthPx),
      grid: bool(o['grid'], d.settings.grid),
      shadow: bool(o['shadow'], d.settings.shadow),
      framing: oneOf<ExportFraming>(o['framing'], EXPORT_FRAMINGS, d.settings.framing),
      fixedWidthPx: num(o['fixedWidthPx'], d.settings.fixedWidthPx),
      fixedHeightPx: num(o['fixedHeightPx'], d.settings.fixedHeightPx),
      boundsMargin: num(o['boundsMargin'], d.settings.boundsMargin),
    },
  }
}

function readVariants(v: unknown): Variant[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  return v.filter(isObj).flatMap((x, i) => {
    const id = typeof x['id'] === 'string' && !seen.has(x['id']) ? x['id'] : `v-loaded-${i}`
    seen.add(id)
    return [{ id, name: str(x['name'], `Shot ${i + 1}`), camera: readCamera(x['camera']), pose: readPose(x['pose']) }]
  }).slice(0, MAX_VARIANTS)
}

function readMeta(file: Obj): SceneMeta {
  const d = defaultMeta()
  return { tags: strArray(file['tags']), notes: str(file['notes'], d.notes) }
}

/** Parses a scene.json or export sidecar. Missing fields fall back to defaults; canvas.aspect wins. */
export function fromSceneV1(raw: unknown): { doc: Doc; exportSettings: ExportSettings; name: string | null } {
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
        groundShadow: bool(scene['groundShadow'], ds.groundShadow),
      },
      body: readBody(file['body']),
      pose: readPose(file['pose']),
      camera: readCamera(file['camera']),
      sketch: readSketch(file['sketch']),
      variants: readVariants(file['variants']),
      meta: readMeta(file),
    },
    exportSettings,
    name: typeof file['name'] === 'string' && file['name'].trim() ? file['name'] : null,
  }
}
