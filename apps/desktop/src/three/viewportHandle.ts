// Lets panels ask the mounted viewport for renders without holding Three.js objects in state.
export interface ViewportHandle {
  renderExport: (widthPx: number, heightPx: number) => Promise<Uint8Array>
}

let current: ViewportHandle | null = null

export const setViewportHandle = (h: ViewportHandle | null): void => {
  current = h
}

export const getViewportHandle = (): ViewportHandle | null => current
