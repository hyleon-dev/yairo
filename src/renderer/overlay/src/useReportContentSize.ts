import { useEffect, useRef } from 'react'
import type { OverlayId } from '../../../shared/types'

// Overlay windows should never be smaller than their actual content (e.g.
// Standings with many drivers), this hook measures the natural size of the
// rendered content and reports it to windowManager.setOverlayContentSize().
//
// Only relevant for the Electron overlay windows (window.overlayApi) and
// only during live operation: in edit mode the user controls size via drag,
// otherwise the window would keep snapping back to the content size.
export function useReportContentSize(overlayId: OverlayId, editMode: boolean) {
  const ref = useRef<HTMLDivElement>(null)

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

  return ref
}
