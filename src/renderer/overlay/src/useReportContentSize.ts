import { useEffect, useRef } from 'react'
import type { OverlayId } from '../../../shared/types'

// Overlay windows should never be smaller than their actual content (e.g.
// Standings with many drivers), this hook measures the natural size of the
// rendered content and reports it to windowManager.setOverlayContentSize().
//
// Only relevant for the Electron overlay windows (window.overlayApi).
export function useReportContentSize(overlayId: OverlayId, editMode: boolean, scale: number) {
  const ref = useRef<HTMLDivElement>(null)

  // Continuous auto-fit, live operation only: in edit mode the user controls
  // size via drag, reporting every observed size change here would fight
  // that and the window would keep snapping back to the content size.
  useEffect(() => {
    if (!window.overlayApi || editMode || !ref.current) return

    const report = (width: number, height: number) => {
      window.overlayApi.setOverlayContentSize(overlayId, Math.ceil(width), Math.ceil(height))
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.target.getBoundingClientRect()
      if (rect) report(rect.width, rect.height)
    })
    observer.observe(ref.current)

    // Report the current size immediately, don't wait for the next change.
    const initialRect = ref.current.getBoundingClientRect()
    report(initialRect.width, initialRect.height)

    return () => observer.disconnect()
  }, [overlayId, editMode])

  // Changing the scale setting changes the content's actual rendered size
  // (CSS zoom) even while in edit mode - without this, the drag/resize area
  // (the window itself) stays at its old size and visibly drifts out of sync
  // with the now-scaled content. Unlike the continuous observer above, this
  // is a one-off resize tied to the scale value itself, not to every layout
  // change, so it doesn't fight manual dragging in edit mode.
  useEffect(() => {
    if (!window.overlayApi || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    window.overlayApi.setOverlayContentSize(overlayId, Math.ceil(rect.width), Math.ceil(rect.height), true)
  }, [overlayId, scale])

  return ref
}
