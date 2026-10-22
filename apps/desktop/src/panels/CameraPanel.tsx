import { controlsFromCamera, MAX_PITCH_RAD } from '../lib/cameraMath'
import { degToRad, MAX_FOCAL_MM, MIN_FOCAL_MM, radToDeg } from '../lib/units'
import { MAX_SENSOR_HEIGHT_MM, MIN_SENSOR_HEIGHT_MM } from '../state/cameraSlice'
import { useStore } from '../state/store'
import type { EditOpts } from '../state/types'
import { Slider } from '../ui/Slider'

/** Common canvas ratios (width / height). */
export const ASPECT_PRESETS: readonly { label: string; ratio: number }[] = [
  { label: '2:3', ratio: 2 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '16:9', ratio: 16 / 9 },
]
/** Two ratios closer than this are treated as the same preset. */
const RATIO_MATCH_EPSILON = 1e-4

const MAX_PITCH_DEG = radToDeg(MAX_PITCH_RAD)

export function CameraPanel() {
  const camera = useStore((s) => s.camera)
  const ratio = useStore((s) => s.scene.canvasRatio)
  const a = useStore((s) => s)
  const c = controlsFromCamera(camera.position, camera.target)
  const pv = (preview: boolean): EditOpts => ({ preview })

  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Shot camera</h2>
        <button type="button" className="text-xs text-neutral-400 hover:text-white" onClick={a.resetCamera}>
          Reset
        </button>
      </div>
      <Slider label="Height" value={c.height} min={-1} max={5} step={0.01} unit="m" onChange={(v, p) => a.setCameraHeight(v, pv(p))} onCommit={a.endGesture} />
      <Slider
        label="Target height"
        value={c.targetHeight}
        min={-1}
        max={4}
        step={0.01}
        unit="m"
        onChange={(v, p) => a.setCameraTargetHeight(v, pv(p))}
        onCommit={a.endGesture}
      />
      <Slider label="Distance" value={c.distance} min={0.3} max={25} step={0.01} unit="m" onChange={(v, p) => a.setCameraDistance(v, pv(p))} onCommit={a.endGesture} />
      <Slider
        label="Yaw"
        value={c.yaw}
        min={-180}
        max={180}
        step={0.5}
        unit="°"
        decimals={1}
        toDisplay={radToDeg}
        fromDisplay={degToRad}
        onChange={(v, p) => a.setCameraYaw(v, pv(p))}
        onCommit={a.endGesture}
      />
      <Slider
        label="Pitch"
        value={c.pitch}
        min={-MAX_PITCH_DEG}
        max={MAX_PITCH_DEG}
        step={0.5}
        unit="°"
        decimals={1}
        toDisplay={radToDeg}
        fromDisplay={degToRad}
        onChange={(v, p) => a.setCameraPitch(v, pv(p))}
        onCommit={a.endGesture}
      />
      <Slider
        label="Roll"
        value={camera.roll}
        min={-180}
        max={180}
        step={0.5}
        unit="°"
        decimals={1}
        toDisplay={radToDeg}
        fromDisplay={degToRad}
        onChange={(v, p) => a.setCameraRoll(v, pv(p))}
        onCommit={a.endGesture}
      />
      <Slider
        label="Focal length"
        value={camera.focal}
        min={MIN_FOCAL_MM}
        max={MAX_FOCAL_MM}
        step={1}
        unit="mm"
        decimals={0}
        onChange={(v, p) => a.setCameraFocal(v, pv(p))}
        onCommit={a.endGesture}
      />
      <Slider
        label="Sensor height"
        value={camera.sensorHeight}
        min={MIN_SENSOR_HEIGHT_MM}
        max={MAX_SENSOR_HEIGHT_MM}
        step={0.1}
        unit="mm"
        decimals={1}
        onChange={(v, p) => a.setCameraSensorHeight(v, pv(p))}
        onCommit={a.endGesture}
      />
      <div className="pt-1 text-xs">
        <div className="mb-1 text-neutral-400">Aspect ratio</div>
        <div className="flex flex-wrap gap-1">
          {ASPECT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => a.setCanvasRatio(p.ratio)}
              className={`rounded px-2 py-0.5 ${
                Math.abs(p.ratio - ratio) < RATIO_MATCH_EPSILON ? 'bg-sky-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2 text-xs text-neutral-400">
        {(['groundPlane', 'grid', 'horizon'] as const).map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input type="checkbox" checked={a.scene[k]} onChange={(e) => a.setSceneFlag(k, e.target.checked)} />
            {k === 'groundPlane' ? 'Ground' : k === 'grid' ? 'Grid' : 'Horizon'}
          </label>
        ))}
      </div>
    </section>
  )
}
