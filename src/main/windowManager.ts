import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from './utils'
import type { OverlayBounds, OverlayConfig, OverlayId } from '../shared/types'

import icon from '../../resources/icon.png?asset'

const PRELOAD_PATH = join(__dirname, '../preload/index.js')

export class WindowManager {
  controlWindow: BrowserWindow | null = null
  private overlayWindows = new Map<OverlayId, BrowserWindow>()

  // --- Control Center -----------------------------------------------

  createControlWindow(
    bounds?: OverlayBounds | null,
    onBoundsChanged?: (bounds: OverlayBounds) => void
  ): BrowserWindow {
    const MIN_CONTROL_WINDOW_WIDTH = 550
    const MIN_CONTROL_WINDOW_HEIGHT = 640

    const win = new BrowserWindow({
      x: bounds?.x,
      y: bounds?.y,
      width: Math.max(bounds?.width ?? MIN_CONTROL_WINDOW_WIDTH),
      height: Math.max(bounds?.height ?? MIN_CONTROL_WINDOW_HEIGHT),
      minWidth: MIN_CONTROL_WINDOW_WIDTH,
      minHeight: MIN_CONTROL_WINDOW_HEIGHT,
      title: 'iRacing Overlay - Control Center',
      autoHideMenuBar: true,
      icon,
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: true
      }
    })

    this.loadRenderer(win, 'control')

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    win.on('closed', () => {
      this.controlWindow = null
      // Control Center is the main window: closing it should quit the
      // whole app (including all overlay windows), not just this one window.
      app.quit()
    })

    // Persist position/size after a manual move/resize
    const reportBounds = () => onBoundsChanged?.(win.getBounds())
    win.on('moved', reportBounds)
    win.on('resized', reportBounds)

    this.controlWindow = win
    return win
  }

  // --- Overlays -------------------------------------------------------

  createOverlayWindow(
    config: OverlayConfig,
    onBoundsChanged?: (id: OverlayId, bounds: OverlayConfig['bounds']) => void
  ): BrowserWindow {
    const existing = this.overlayWindows.get(config.id)
    if (existing && !existing.isDestroyed()) return existing

    const win = new BrowserWindow({
      x: config.bounds.x,
      y: config.bounds.y,
      width: config.bounds.width,
      height: config.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      fullscreenable: false,
      // Overlay should stay on top of fullscreen games:
      focusable: false,
      webPreferences: {
        preload: PRELOAD_PATH,
        sandbox: true
      }
    })

    // "screen-saver" level sits above most exclusive fullscreen applications.
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true, { forward: true }) // default: click-through

    // Overlays never need to open another window.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    win.loadURL(this.rendererUrl('overlay', { overlay: config.id }))

    win.on('closed', () => {
      this.overlayWindows.delete(config.id)
    })

    // Report the new position/size back after drag/resize in edit mode so it can be persisted.
    // Outside edit mode a size change can only come from setOverlayContentSize() (auto-fit)
    const reportBounds = () => {
      if (!win.isResizable()) return
      onBoundsChanged?.(config.id, win.getBounds())
    }
    win.on('moved', reportBounds)
    win.on('resized', reportBounds)

    this.overlayWindows.set(config.id, win)
    return win
  }

  closeOverlayWindow(id: OverlayId): void {
    const win = this.overlayWindows.get(id)
    win?.close()
  }

  getOverlayWindow(id: OverlayId): BrowserWindow | undefined {
    return this.overlayWindows.get(id)
  }

  getAllOverlayWindows(): BrowserWindow[] {
    return Array.from(this.overlayWindows.values())
  }

  // Same as getAllOverlayWindows(), but keeps the id association
  getAllOverlayEntries(): Array<{ id: OverlayId; window: BrowserWindow }> {
    return Array.from(this.overlayWindows.entries()).map(([id, window]) => ({ id, window }))
  }

  // Globally controls whether overlays let mouse clicks through (live) or
  // capture them (edit mode, for dragging/resizing).
  setEditMode(enabled: boolean): void {
    for (const win of this.overlayWindows.values()) {
      win.setIgnoreMouseEvents(!enabled, { forward: true })
      // Make focusable/resizable in edit mode, otherwise windows are hard to
      // grab or resize on Windows.
      win.setFocusable(enabled)
      win.setResizable(enabled)
    }
  }

  setOverlayBounds(id: OverlayId, bounds: OverlayConfig['bounds']): void {
    const win = this.overlayWindows.get(id)
    win?.setBounds(bounds)
  }

  // Resizes an overlay window to the actual rendered size of its content,
  // so e.g. Standings with many drivers isn't cut off.
  // Normally only in live mode, in edit mode the user controls size via drag
  // - `force` overrides that for a scale change (see useReportContentSize.ts):
  // changing the scale setting changes the content's actual rendered size
  // even while in edit mode, so the drag/resize area needs to follow along
  // live, otherwise it drifts out of sync with the visibly (re-)scaled content.
  setOverlayContentSize(id: OverlayId, width: number, height: number, force = false): void {
    const win = this.overlayWindows.get(id)
    if (!win || win.isDestroyed()) return
    if (win.isResizable() && !force) return

    const bounds = win.getBounds()
    if (bounds.width === width && bounds.height === height) return

    win.setBounds({ x: bounds.x, y: bounds.y, width, height })
  }

  // Helper for multi-monitor setups.
  getPrimaryDisplayBounds() {
    return screen.getPrimaryDisplay().workArea
  }

  // --- shared loading logic for the two renderer bundles --------------

  private loadRenderer(win: BrowserWindow, entry: 'control' | 'overlay', params?: Record<string, string>) {
    win.loadURL(this.rendererUrl(entry, params))
  }

  private rendererUrl(entry: 'control' | 'overlay', params?: Record<string, string>): string {
    const query = params ? '?' + new URLSearchParams(params).toString() : ''

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      // electron-vite's dev server has root=src/renderer (see electron.vite.config.ts),
      // so paths are relative to that: /<entry>/index.html
      return `${process.env['ELECTRON_RENDERER_URL']}/${entry}/index.html${query}`
    }

    return `file://${join(__dirname, `../renderer/${entry}/index.html`)}${query}`
  }
}
