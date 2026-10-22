import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { renderExportPng, type ExportScene } from '../export/renderPng'
import { fitRect, SHOT_FRAME_MARGIN_PX, type Rect } from '../lib/frameLayout'
import { enclosedHoles } from '../lib/negativeSpace'
import { appStore, useStore } from '../state/store'
import type { Store } from '../state/types'
import { Toggle } from '../ui/Toggle'
import { applyShotCamera, CAMERA_NEAR_M, createEditorCamera, createShotCamera } from './cameraRig'
import { createBalanceOverlay } from './balanceOverlay'
import { createHelpers, GROUND_SIZE_M } from './helpers'
import { createIkHandles } from './ikHandles'
import { createJointGizmo } from './jointGizmo'
import { createLooks, depthRange, renderComposite } from './looks'
import { createMannequin } from './mannequin'
import { createAnatomyLayer } from './anatomy/anatomyLayer'
import { startAnatomySync } from './anatomy/anatomySync'
import { createOverlays } from './overlays'
import { CueOverlay } from './CueOverlay'
import { LandmarkOverlay } from './LandmarkOverlay'
import { LensGuide } from './LensGuide'
import { NudgeHandles } from './NudgeHandles'
import { SketchLayer, SketchOverlay } from './SketchLayer'
import { ViewportHud } from './ViewportHud'
import { confidenceMaps, startSceneSync } from './sceneSync'
import { setViewportHandle } from './viewportHandle'
import { isNudgeJoint } from '../solve/depthNudge'

/** Editor view draws the shot frustum out to this multiple of the camera-to-target distance. */
const FRUSTUM_DISPLAY_DEPTH = 1.3
/** The depth-nudge handles sit this far (px) right of and above the selected joint, clear of its rotate gizmo. */
const NUDGE_ANCHOR_OFFSET_PX: readonly [number, number] = [28, -44]
/** Key light offset from the figure's floor point (m); the light follows the figure so its shadow stays in range. */
const KEY_LIGHT_OFFSET: readonly [number, number, number] = [3, 5, 4]
/** Shadow camera half-size (m) around the figure, and shadow map size (px). */
const SHADOW_HALF_SIZE_M = 2.5
const SHADOW_MAP_PX = 2048
const SHADOW_OPACITY = 0.35
/** The shadow catcher sits just above the ground plane and grid. */
const SHADOW_CATCHER_Y_M = 0.002
/** Negative space is found on a mask this wide (px), refreshed at most every this many frames. */
const NEGATIVE_SPACE_MASK_PX = 320
const NEGATIVE_SPACE_EVERY_FRAMES = 6
const NEGATIVE_SPACE_RGBA: readonly [number, number, number, number] = [251, 146, 60, 120]

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null)
  const nudgeAnchorRef = useRef<HTMLDivElement>(null)
  const negativeRef = useRef<HTMLCanvasElement>(null)
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
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const canvas = renderer.domElement
    canvas.style.position = 'absolute'
    canvas.style.display = 'block'
    host.appendChild(canvas)

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.4))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(...KEY_LIGHT_OFFSET)
    key.shadow.mapSize.set(SHADOW_MAP_PX, SHADOW_MAP_PX)
    Object.assign(key.shadow.camera, { left: -SHADOW_HALF_SIZE_M, right: SHADOW_HALF_SIZE_M, top: SHADOW_HALF_SIZE_M, bottom: -SHADOW_HALF_SIZE_M })
    key.shadow.camera.updateProjectionMatrix()
    scene.add(key, key.target)

    // Catches the figure's shadow and is otherwise invisible, so it can go into exported PNGs.
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE_M, GROUND_SIZE_M), new THREE.ShadowMaterial({ opacity: SHADOW_OPACITY }))
    shadowCatcher.rotation.x = -Math.PI / 2
    shadowCatcher.position.y = SHADOW_CATCHER_Y_M
    shadowCatcher.receiveShadow = true
    scene.add(shadowCatcher)
    const looks = createLooks()

    const mannequin = createMannequin()
    scene.add(mannequin.group)
    const anatomy = createAnatomyLayer(mannequin)
    const ghost = createMannequin({ ghost: true })
    ghost.group.visible = false
    scene.add(ghost.group)
    const overlays = createOverlays(mannequin.nodes.head)
    scene.add(overlays.headUnits)
    const helpers = createHelpers()
    scene.add(helpers.group)
    const balance = createBalanceOverlay()
    scene.add(balance.group)

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

    /** Drawn after the figure and never given its look (readability modes, occlusion hint). */
    const viewportOverlays = [gizmo.helper, ikHandles.group, overlays.headUnits, ghost.group, balance.group]

    let ratio = appStore.getState().scene.canvasRatio
    const stopSync = startSceneSync(appStore, {
      mannequin,
      ghost,
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

    const stopAnatomySync = startAnatomySync(appStore, anatomy)

    const syncBalance = (s: Store, prev: Store | null): void => {
      if (prev && s.balance === prev.balance && s.overlays.balance === prev.overlays.balance) return
      balance.update(s.overlays.balance ? s.balance : null)
    }
    syncBalance(appStore.getState(), null)
    const stopBalanceSync = appStore.subscribe(syncBalance)
    const syncShadow = (s: Store, prev: Store | null): void => {
      if (prev && s.scene.groundShadow === prev.scene.groundShadow) return
      shadowCatcher.visible = s.scene.groundShadow
      key.castShadow = s.scene.groundShadow
    }
    syncShadow(appStore.getState(), null)
    const stopShadowSync = appStore.subscribe(syncShadow)

    // In SHOT view the canvas itself is sized to the shot aspect, so picking and the gizmo
    // use the same pixels the shot camera renders.
    let lastKey = ''
    let canvasRect: Rect = { left: 0, top: 0, width: 1, height: 1 }
    const layout = (): void => {
      const w = host.clientWidth
      const h = host.clientHeight
      const shot = isShot()
      const r: Rect = shot ? fitRect(w, h, ratio, SHOT_FRAME_MARGIN_PX) : { left: 0, top: 0, width: w, height: h }
      const k = `${r.left}|${r.top}|${r.width}|${r.height}|${shot}`
      if (k === lastKey) return
      lastKey = k
      canvasRect = r
      canvas.style.left = `${r.left}px`
      canvas.style.top = `${r.top}px`
      canvas.style.width = `${r.width}px`
      canvas.style.height = `${r.height}px`
      renderer.setSize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)), false)
      editorCam.aspect = r.width / Math.max(1, r.height)
      editorCam.updateProjectionMatrix()
    }

    // ---- Negative space: render the figure mask small, flood-fill the background, tint enclosed holes ----
    const holeCanvas = negativeRef.current
    const holeCtx = holeCanvas?.getContext('2d') ?? null
    const maskTarget = new THREE.WebGLRenderTarget(1, 1)
    const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    let holeFrame = 0
    let holeKey = ''
    let holePose: unknown = null
    let holeBody: unknown = null
    const updateNegativeSpace = (cam: THREE.PerspectiveCamera, st: Store): void => {
      if (!holeCanvas || !holeCtx) return
      if (!st.overlays.negativeSpace) {
        holeCanvas.style.display = 'none'
        holeKey = ''
        return
      }
      if (holeFrame++ % NEGATIVE_SPACE_EVERY_FRAMES !== 0) return
      const k = `${cam.matrixWorld.elements.join(',')}|${cam.projectionMatrix.elements.join(',')}|${canvasRect.width}x${canvasRect.height}|${st.figureStyle}`
      if (k === holeKey && st.pose === holePose && st.body === holeBody) return
      holeKey = k
      holePose = st.pose
      holeBody = st.body
      const w = Math.max(16, Math.min(NEGATIVE_SPACE_MASK_PX, Math.round(canvasRect.width)))
      const h = Math.max(16, Math.round((w * canvasRect.height) / Math.max(1, canvasRect.width)))
      maskTarget.setSize(w, h)
      const buf = new Uint8Array(w * h * 4)
      const children = [...scene.children]
      const saved = children.map((o) => o.visible)
      try {
        children.forEach((o) => (o.visible = o === mannequin.group))
        scene.overrideMaterial = maskMat
        renderer.setRenderTarget(maskTarget)
        renderer.clear()
        renderer.render(scene, cam)
        renderer.readRenderTargetPixels(maskTarget, 0, 0, w, h, buf)
      } finally {
        scene.overrideMaterial = null
        renderer.setRenderTarget(null)
        children.forEach((o, i) => (o.visible = Boolean(saved[i])))
      }
      // Render targets read bottom-up; the mask is built top-down.
      const figure = new Uint8Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) figure[y * w + x] = (buf[((h - 1 - y) * w + x) * 4 + 3] as number) > 0 ? 1 : 0
      const { mask } = enclosedHoles(figure, w, h)
      holeCanvas.width = w
      holeCanvas.height = h
      const img = holeCtx.createImageData(w, h)
      for (let i = 0; i < w * h; i++) if (mask[i]) img.data.set(NEGATIVE_SPACE_RGBA, i * 4)
      holeCtx.putImageData(img, 0, 0)
      Object.assign(holeCanvas.style, {
        display: 'block',
        left: `${canvasRect.left}px`,
        top: `${canvasRect.top}px`,
        width: `${canvasRect.width}px`,
        height: `${canvasRect.height}px`,
      })
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
      const st = appStore.getState()
      const cam = shot ? shotCam : editorCam
      if (st.scene.groundShadow) {
        // Anatomy forms are added on rig changes, so cast flags are refreshed while the shadow is on.
        mannequin.group.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = true
        })
        key.target.position.set(mannequin.root.position.x, 0, mannequin.root.position.z)
        key.position.set(key.target.position.x + KEY_LIGHT_OFFSET[0], KEY_LIGHT_OFFSET[1], key.target.position.z + KEY_LIGHT_OFFSET[2])
      }
      if (st.viewLook === 'depth') {
        cam.updateMatrixWorld()
        looks.setDepthRange(...depthRange(cam, Object.values(mannequin.nodes).map((n) => n.getWorldPosition(new THREE.Vector3()))))
      }
      renderComposite(
        renderer,
        cam,
        { scene, figure: mannequin.group, overlays: viewportOverlays },
        { look: looks.material(st.viewLook), occlusion: st.overlays.occlusion ? looks.drawOcclusion : null },
      )
      placeNudgeAnchor(cam)
      updateNegativeSpace(cam, st)
    }

    // The nudge handles follow the selected joint on screen.
    const anchorPos = new THREE.Vector3()
    const placeNudgeAnchor = (cam: THREE.Camera): void => {
      const el = nudgeAnchorRef.current
      if (!el) return
      const j = appStore.getState().selectedJoint
      if (!j || !isNudgeJoint(j)) {
        el.style.display = 'none'
        return
      }
      const p = mannequin.nodes[j].getWorldPosition(anchorPos).project(cam)
      if (p.z < -1 || p.z > 1) {
        el.style.display = 'none'
        return
      }
      el.style.display = 'block'
      // Kept inside the viewport so the handles never slide under its edge.
      const x = Math.min(
        Math.max(0, canvasRect.left + ((p.x + 1) / 2) * canvasRect.width + NUDGE_ANCHOR_OFFSET_PX[0]),
        Math.max(0, host.clientWidth - el.offsetWidth),
      )
      const y = Math.min(
        Math.max(0, canvasRect.top + ((1 - p.y) / 2) * canvasRect.height + NUDGE_ANCHOR_OFFSET_PX[1]),
        Math.max(0, host.clientHeight - el.offsetHeight),
      )
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    }
    tick()

    const exportScene: ExportScene = {
      scene,
      figure: mannequin.group,
      hide: [gizmo.helper, shotFrustum, overlays.headUnits, overlays.gaze, ikHandles.group, ghost.group, balance.group],
      helpers,
      shadowCatcher,
      keyLight: key,
      looks,
    }
    /** The confidence heatmap and the selection colour are viewport-only; the scene's pose is put back afterwards. */
    const cleanFigure = async <T,>(fn: () => Promise<T>): Promise<T> => {
      mannequin.setConfidence(null, null)
      mannequin.setSelected(null)
      mannequin.group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true
      })
      try {
        return await fn()
      } finally {
        const s = appStore.getState()
        mannequin.setConfidence(...confidenceMaps(s))
        mannequin.setSelected(s.selectedJoint)
        mannequin.applyPose(s.pose)
      }
    }
    setViewportHandle({
      renderExport: (req) => cleanFigure(() => renderExportPng(exportScene, req)),
      renderShots: (shots, req) =>
        cleanFigure(async () => {
          const out: Uint8Array[] = []
          for (const shot of shots) {
            mannequin.applyPose(shot.pose)
            out.push((await renderExportPng(exportScene, { ...req, camera: shot.camera })).png)
          }
          return out
        }),
    })

    return () => {
      cancelAnimationFrame(frame)
      setViewportHandle(null)
      stopSync()
      stopAnatomySync()
      stopBalanceSync()
      stopShadowSync()
      balance.dispose()
      looks.dispose()
      maskTarget.dispose()
      maskMat.dispose()
      shadowCatcher.geometry.dispose()
      shadowCatcher.material.dispose()
      anatomy.dispose()
      gizmo.dispose()
      ikHandles.dispose()
      overlays.dispose()
      orbit.dispose()
      shotFrustum.dispose()
      helpers.dispose()
      mannequin.dispose()
      ghost.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-950">
      <SketchLayer />
      <div ref={hostRef} className="absolute inset-0" />
      <canvas ref={negativeRef} className="pointer-events-none absolute" style={{ display: 'none' }} />
      <SketchOverlay />
      <LensGuide />
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
        <span className="max-w-[14rem] truncate rounded bg-black/50 px-2 py-1 text-xs text-neutral-300">
          {selectedJoint ? `Joint: ${selectedJoint}` : 'Click a joint to pose, or drag a cyan handle'}
        </span>
      </div>
      <ViewportHud />
      <div ref={nudgeAnchorRef} className="pointer-events-none absolute left-0 top-0" style={{ display: 'none' }}>
        <NudgeHandles />
      </div>
    </div>
  )
}
