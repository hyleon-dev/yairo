import type { OverlayApi } from '../preload/index'

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}

export {}
