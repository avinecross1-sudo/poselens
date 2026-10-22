// Store -> anatomy layer. Start it after startSceneSync: listeners run in subscription order, so the layer
// re-applies its hiding and tints after the scene sync has reset mannequin materials (selection, heatmap).
import { rigOf } from '../../state/rigOf'
import type { AppStore } from '../../state/store'
import type { Store } from '../../state/types'
import type { AnatomyLayer } from './anatomyLayer'

export function startAnatomySync(store: AppStore, layer: AnatomyLayer): () => void {
  const apply = (s: Store, prev: Store | null): void => {
    if (!prev || s.body.sliders !== prev.body.sliders || s.body.asymmetry !== prev.body.asymmetry) layer.applyRig(rigOf(s.body))
    if (!prev || s.figureStyle !== prev.figureStyle) layer.setEnabled(s.figureStyle === 'anatomy')
    layer.enforce()
  }
  apply(store.getState(), null)
  return store.subscribe((s, prev) => apply(s, prev))
}
