import { useEffect, useState, type RefObject } from 'react'
import { fitRect, SHOT_FRAME_MARGIN_PX, type Rect } from '../lib/frameLayout'
import { useStore } from '../state/store'

/** Viewport size plus the shot frame rect inside it, kept current with the container and canvas ratio. */
export function useFrameRect(ref: RefObject<Element | null>): { width: number; height: number; rect: Rect } {
  const ratio = useStore((s) => s.scene.canvasRatio)
  const [size, setSize] = useState({ width: 1, height: 1 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (): void => setSize({ width: Math.max(1, el.clientWidth), height: Math.max(1, el.clientHeight) })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return { ...size, rect: fitRect(size.width, size.height, ratio, SHOT_FRAME_MARGIN_PX) }
}
