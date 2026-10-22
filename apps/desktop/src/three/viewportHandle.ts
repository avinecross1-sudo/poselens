// Lets panels ask the mounted viewport for renders without holding Three.js objects in state.
import type { ExportRequest, RenderedPng } from '../export/renderPng'
import type { CameraState, PoseState } from '../types/scene'

export interface ViewportHandle {
  renderExport: (req: ExportRequest) => Promise<RenderedPng>
  /** One PNG per shot (camera + pose), all with the same look and framing; the scene's own pose is restored after. */
  renderShots: (shots: readonly { camera: CameraState; pose: PoseState }[], req: Omit<ExportRequest, 'camera'>) => Promise<Uint8Array[]>
}

let current: ViewportHandle | null = null

export const setViewportHandle = (h: ViewportHandle | null): void => {
  current = h
}

export const getViewportHandle = (): ViewportHandle | null => current
