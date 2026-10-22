import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { renderTransparentPng } from '../export/renderPng'
import { fitRect, SHOT_FRAME_MARGIN_PX, type Rect } from '../lib/frameLayout'
import { appStore, useStore } from '../state/store'
import { Toggle } from '../ui/Toggle'
import { applyShotCamera, CAMERA_NEAR_M, createEditorCamera, createShotCamera } from './cameraRig'
import { createHelpers } from './helpers'
import { createIkHandles } from './ikHandles'
import { createJointGizmo } from './jointGizmo'
import { createMannequin } from './mannequin'
import { createOverlays } from './overlays'
import { CueOverlay } from './CueOverlay'
import { LandmarkOverlay } from './LandmarkOverlay'
import { SketchLayer } from './SketchLayer'
import { ViewportHud } from './ViewportHud'
import { confidenceMaps, startSceneSync } from './sceneSync'
import { setViewportHandle } from './viewportHandle'

/** Editor view draws the shot frustum out to this multiple of the camera-to-target distance. */
const FRUSTUM_DISPLAY_DEPTH = 1.3

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null)
  const activeCamera = useStore((s) => s.activeCamera)
  const setActiveCamera = useStore((s) => s.setActiveCamera)
  const selectedJoint = useStore((s) => s.selectedJoint)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.autoClear = true
    // Transparent: the letterbox, frame colour and sketch underlay are drawn behind the canvas (SketchLayer).
    renderer.setClearColor(0x000000, 0)
    const canvas = renderer.domElement
    canvas.style.position = 'absolute'
    canvas.style.display = 'block'
    host.appendChild(canvas)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(3, 5, 4)
    scene.add(key)

    const mannequin = createMannequin()
    scene.add(mannequin.group)
    const overlays = createOverlays(mannequin.nodes.head)
    scene.add(overlays.headUnits)
    const helpers = createHelpers()
    scene.add(helpers.group)

    const { camera: editorCam, controls: orbit } = createEditorCamera(canvas)
    const shotCam = createShotCamera()
    // The helper draws a proxy with a short far plane; the real shot camera's far plane reaches the horizon ring.
    const frustumProxy = createShotCamera()
    const shotFrustum = new THREE.CameraHelper(frustumProxy)
    scene.add(shotFrustum)

    const isShot = (): boolean => appStore.getState().activeCamera === 'shot'
    const activeCam = (): THREE.PerspectiveCamera => (isShot() ? shotCam : editorCam)

    const gizmo = createJointGizmo(mannequin, activeCam, canvas, {
      onSelect: (j) => appStore.getState().selectJoint(j),
      onRotate: (j, r) => appStore.getState().setJointRotation(j, r, { preview: true }),
      onRotateEnd: () => appStore.getState().endGesture(),
      // OrbitControls may only ever drive the EDITOR camera.
      onDraggingChanged: (d) => (orbit.enabled = !d && !isShot()),
    })
    scene.add(gizmo.helper)

    const ikHandles = createIkHandles(mannequin, activeCam, canvas, {
      onDrag: (chain, p) => appStore.getState().solveIkTarget(chain, [p.x, p.y, p.z], { preview: true }),
      onDragEnd: () => appStore.getState().endGesture(),
      onDraggingChanged: (d) => (orbit.enabled = !d && !isShot()),
    })
    scene.add(ikHandles.group)

    let ratio = appStore.getState().scene.canvasRatio
    const stopSync = startSceneSync(appStore, {
      mannequin,
      helpers,
      gizmo,
      overlays,
      ikHandles,
      onShotCameraChange: (s) => {
        ratio = s.scene.canvasRatio
        applyShotCamera(shotCam, s.camera, ratio)
        applyShotCamera(frustumProxy, s.camera, ratio)
        frustumProxy.far = Math.max(
          CAMERA_NEAR_M * 2,
          new THREE.Vector3(...s.camera.position).distanceTo(new THREE.Vector3(...s.camera.target)) * FRUSTUM_DISPLAY_DEPTH,
        )
        frustumProxy.updateProjectionMatrix()
        shotFrustum.update()
      },
      onActiveCameraChange: (s) => {
        orbit.enabled = s.activeCamera === 'editor'
        gizmo.setCamera(activeCam())
      },
    })

    // In SHOT view the canvas itself is sized to the shot aspect, so picking and the gizmo
    // use the same pixels the shot camera renders.
    let lastKey = ''
    const layout = (): void => {
      const w = host.clientWidth
      const h = host.clientHeight
      const shot = isShot()
      const r: Rect = shot ? fitRect(w, h, ratio, SHOT_FRAME_MARGIN_PX) : { left: 0, top: 0, width: w, height: h }
      const k = `${r.left}|${r.top}|${r.width}|${r.height}|${shot}`
      if (k === lastKey) return
      lastKey = k
      canvas.style.left = `${r.left}px`
      canvas.style.top = `${r.top}px`
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      renderer.setSize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)), false)
      editorCam.aspect = r.width / Math.max(1, r.height)
      editorCam.updateProjectionMatrix()
    }

    let frame = 0
    const tick = (): void => {
      frame = requestAnimationFrame(tick)
      layout()
      const shot = isShot()
      if (!shot) orbit.update()
      shotFrustum.visible = !shot
      helpers.horizon.visible = shot && appStore.getState().scene.horizon
      helpers.updateHorizon(shotCam.position)
      ikHandles.update()
      overlays.follow(mannequin.root.position, mannequin.root.rotation.y)
      renderer.render(scene, shot ? shotCam : editorCam)
    }
    tick()

    setViewportHandle({
      renderExport: async (widthPx, heightPx) => {
        // The confidence heatmap is viewport-only.
        mannequin.setConfidence(null, null)
        try {
          return await renderTransparentPng({
            scene,
            camera: appStore.getState().camera,
            widthPx,
            heightPx,
            hide: [helpers.group, gizmo.helper, shotFrustum, overlays.headUnits, overlays.gaze, ikHandles.group],
          })
        } finally {
          mannequin.setConfidence(...confidenceMaps(appStore.getState()))
        }
      },
    })

    return () => {
      cancelAnimationFrame(frame)
      setViewportHandle(null)
      stopSync()
      gizmo.dispose()
      ikHandles.dispose()
      overlays.dispose()
      orbit.dispose()
      shotFrustum.dispose()
      helpers.dispose()
      mannequin.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950">
      <SketchLayer />
      <div ref={hostRef} className="absolute inset-0" />
      <CueOverlay />
      <LandmarkOverlay />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-3">
        <div className="pointer-events-auto">
          <Toggle
            options={[
              { value: 'editor', label: 'Editor cam' },
              { value: 'shot', label: 'Shot cam' },
            ]}
            value={activeCamera}
            onChange={setActiveCamera}
          />
        </div>
        <span className="rounded bg-black/50 px-2 py-1 text-xs text-neutral-300">
          {selectedJoint ? `Joint: ${selectedJoint}` : 'Click a joint to pose, or drag a cyan handle'}
        </span>
      </div>
      <ViewportHud />
    </div>
  )
}
