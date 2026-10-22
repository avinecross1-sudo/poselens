import type { PoseLensApi } from './ipc'

declare global {
  interface Window {
    poselens: PoseLensApi
  }
}

export {}
