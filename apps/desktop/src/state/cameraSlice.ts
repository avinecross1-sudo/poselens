import type { StateCreator } from 'zustand'
import * as cm from '../lib/cameraMath'
import { clamp, MAX_FOCAL_MM, MIN_FOCAL_MM } from '../lib/units'
import type { Vec3 } from '../types/scene'
import { defaultCamera } from './defaults'
import type { CameraSlice, EditOpts, Store } from './types'

/** Sensor heights outside this range (mm) are not real camera formats. */
export const MIN_SENSOR_HEIGHT_MM = 4
export const MAX_SENSOR_HEIGHT_MM = 60

type Placement = (position: Vec3, target: Vec3, v: number) => { position: Vec3; target: Vec3 }

export const createCameraSlice: StateCreator<Store, [], [], CameraSlice> = (_set, get) => {
  /** Camera edits; ignored under trace lock, which keeps the shot camera lined up with the sketch. */
  const edit: Store['edit'] = (label, recipe, opts) => {
    if (!get().sketchView.traceLock) get().edit(label, recipe, opts)
  }
  const place = (label: string, fn: Placement) => (v: number, opts?: EditOpts) =>
    edit(label, (s) => ({ camera: { ...s.camera, ...fn(s.camera.position, s.camera.target, v) } }), opts)

  return {
    camera: defaultCamera(),
    setCameraHeight: place('Camera height', cm.setHeight),
    setCameraTargetHeight: place('Camera target height', cm.setTargetHeight),
    setCameraYaw: place('Camera yaw', cm.setYaw),
    setCameraPitch: place('Camera pitch', cm.setPitch),
    setCameraDistance: place('Camera distance', cm.setDistance),
    setCameraRoll: (v, opts) => edit('Camera roll', (s) => ({ camera: { ...s.camera, roll: v } }), opts),
    setCameraFocal: (v, opts) =>
      edit('Focal length', (s) => ({ camera: { ...s.camera, focal: clamp(v, MIN_FOCAL_MM, MAX_FOCAL_MM) } }), opts),
    setCameraSensorHeight: (v, opts) =>
      edit(
        'Sensor height',
        (s) => ({ camera: { ...s.camera, sensorHeight: clamp(v, MIN_SENSOR_HEIGHT_MM, MAX_SENSOR_HEIGHT_MM) } }),
        opts,
      ),
    resetCamera: () => edit('Reset camera', () => ({ camera: defaultCamera() })),
  }
}
