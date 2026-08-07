import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'http'
import { readFile } from 'fs/promises'
import { extname, resolve, sep } from 'path'
import { WebSocketServer, type WebSocket } from 'ws'
import { is } from './utils'
import { OVERLAY_SERVER_PORT } from '../shared/types'

const PORT = OVERLAY_SERVER_PORT

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

// Static files live in the built renderer bundle, relative to this file
// after the build (out/main/overlayServer.js -> out/renderer).
const RENDERER_DIST_DIR = resolve(__dirname, '../renderer')

// Makes every overlay reachable at http://127.0.0.1:<PORT>/overlays/<id>,
// e.g. as an OBS browser source or for debugging in a normal browser.
// There is no window.overlayApi (Electron contextBridge) there,
// so we also mirror the same events via WebSocket on the same host/port
// (see useOverlayBridge.ts in the renderer).
export class OverlayServer {
  private server = createServer((req, res) => {
    void this.handleRequest(req, res)
  })
  private wss = new WebSocketServer({ server: this.server })
  private clients = new Set<WebSocket>()
  private snapshot = new Map<string, unknown>()

  start(): void {
    this.wss.on('connection', (socket) => {
      this.clients.add(socket)
      // Send last known state immediately, so late-connecting clients
      // don't have to wait for next telemetry tick.
      for (const [channel, payload] of this.snapshot) {
        socket.send(JSON.stringify({ channel, payload }))
      }
      socket.on('close', () => this.clients.delete(socket))
    })

    this.server.listen(PORT, '127.0.0.1', () => {
      console.log(`[overlay-server] running at http://127.0.0.1:${PORT} (e.g. /overlays/standings)`)
    })
  }

  stop(): void {
    for (const client of this.clients) client.close()
    this.wss.close()
    this.server.close()
  }

  broadcast(channel: string, payload: unknown): void {
    this.snapshot.set(channel, payload)
    const message = JSON.stringify({ channel, payload })
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) client.send(message)
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

    // Short memorable URL for OBS/debugging: /overlays/<id> -> redirects to
    // the actual overlay page with ?overlay=<id> (the same page the Electron
    // overlay windows load).
    const overlayMatch = url.pathname.match(/^\/overlays\/([\w-]+)\/?$/)
    if (overlayMatch) {
      res.writeHead(302, { Location: `/overlay/index.html?overlay=${overlayMatch[1]}` })
      res.end()
      return
    }

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.proxyToDevServer(req, res)
      return
    }

    await this.serveStatic(url.pathname, res)
  }

  // Nothing is prebuilt in dev mode. electron-vite's Vite dev server
  // already serves renderer files live over HTTP, we just pass the request through.
  private proxyToDevServer(req: IncomingMessage, res: ServerResponse): void {
    const target = new URL(req.url ?? '/', process.env['ELECTRON_RENDERER_URL'])
    const proxyReq = httpRequest(target, { method: req.method, headers: req.headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
      proxyRes.pipe(res)
    })
    proxyReq.on('error', () => {
      res.writeHead(502)
      res.end('Dev server unreachable')
    })
    req.pipe(proxyReq)
  }

  private async serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    const relative = pathname === '/' ? '/overlay/index.html' : decodeURIComponent(pathname)
    const filePath = resolve(RENDERER_DIST_DIR, '.' + relative)

    // Don't allow escaping the renderer directory.
    if (filePath !== RENDERER_DIST_DIR && !filePath.startsWith(RENDERER_DIST_DIR + sep)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }

    try {
      const data = await readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  }
}
