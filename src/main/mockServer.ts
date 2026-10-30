import { app, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse
} from 'http'
import { join } from 'path'
import {
  compileRoutes,
  matchRoute,
  pathFromRequestUrl,
  pickMockResponse,
  type CompiledRoute,
  type MockRoute
} from '../shared/mock'
import type { EndpointStamp } from '../shared/specSync'
import type { MockRouteInfo, MockStartResult, MockStatus, SavedRequest } from '../shared/types'

const META_FILE = 'sonda.collection.json'

interface Running {
  server: Server
  collectionId: string
  port: number
  routes: MockRouteInfo[]
}

let running: Running | null = null

/** Carpeta de la colección dentro del workspace (~/Documents/Sonda/<id>) */
function collectionDir(id: string): string {
  if (!id || id.startsWith('.') || /[\\/]/.test(id)) throw new Error('Colección no válida')
  return join(app.getPath('documents'), 'Sonda', id)
}

/** Lee la colección: una ruta por petición, con el path de la spec ({petId}) si viene de una */
async function loadRoutes(
  collectionId: string
): Promise<{ routes: MockRoute[]; basePath: string }> {
  const dir = collectionDir(collectionId)

  let meta: { baseUrl?: string; endpoints?: Record<string, EndpointStamp> } = {}
  try {
    meta = JSON.parse(await fs.readFile(join(dir, META_FILE), 'utf-8'))
  } catch {
    // Colección sin metadatos (creada a mano): se usa la URL de cada petición
  }

  // Carpetas de la colección (un nivel) + la raíz
  const folders = ['']
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) folders.push(entry.name)
  }

  const byKey = new Map<string, MockRoute>()
  for (const folder of folders) {
    const folderDir = join(dir, folder)
    for (const file of await fs.readdir(folderDir)) {
      if (!file.endsWith('.json') || file === META_FILE) continue

      let request: SavedRequest
      try {
        request = JSON.parse(await fs.readFile(join(folderDir, file), 'utf-8'))
      } catch {
        continue
      }
      if (typeof request.method !== 'string' || typeof request.url !== 'string') continue

      const rel = folder ? `${folder}/${file}` : file
      const key = meta.endpoints?.[rel]?.key // "GET /pet/{petId}"
      const path = key ? key.slice(key.indexOf(' ') + 1) : pathFromRequestUrl(request.url)
      const method = request.method.toUpperCase() as MockRoute['method']

      const id = `${method} ${path}`
      if (byKey.has(id)) continue
      byKey.set(id, { method, path, ...pickMockResponse(request.responseSchemas) })
    }
  }

  let basePath = ''
  try {
    if (meta.baseUrl) basePath = new URL(meta.baseUrl).pathname.replace(/\/$/, '')
  } catch {
    // baseUrl no es una URL absoluta: no hay prefijo que quitar
  }
  return { routes: [...byKey.values()], basePath }
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void

function makeHandler(routes: CompiledRoute[], basePath: string): Handler {
  return (req, res) => {
    req.resume() // el mock ignora el body, pero hay que vaciarlo

    const cors: OutgoingHttpHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '*'
    }

    // Preflight de CORS: lo responde el mock para que un frontend en el navegador pueda usarlo
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.writeHead(204, cors).end()
      return
    }

    let pathname: string
    try {
      pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    } catch {
      res.writeHead(400, cors).end()
      return
    }

    const method = req.method ?? 'GET'
    const find = (p: string): CompiledRoute | undefined =>
      matchRoute(routes, method, p) ??
      (method === 'HEAD' ? matchRoute(routes, 'GET', p) : undefined)

    // Funciona con y sin el prefijo del servidor de la spec (/api/v3/pet/1 o /pet/1)
    let route = find(pathname)
    if (!route && basePath && pathname.startsWith(basePath)) {
      route = find(pathname.slice(basePath.length) || '/')
    }

    if (!route) {
      res
        .writeHead(404, { ...cors, 'content-type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ error: 'Sonda mock: ruta no definida', method, path: pathname }))
      return
    }

    res
      .writeHead(route.status, {
        ...cors,
        'x-sonda-mock': 'true',
        ...(route.body ? { 'content-type': 'application/json; charset=utf-8' } : {})
      })
      .end(route.body)
  }
}

async function stopMock(): Promise<void> {
  if (!running) return
  const { server } = running
  running = null
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections() // las conexiones keep-alive no dejarían cerrar
  })
}

async function startMock(collectionId: string, port: number): Promise<MockStartResult> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { ok: false, error: 'El puerto debe estar entre 1024 y 65535' }
  }
  await stopMock()

  let loaded: Awaited<ReturnType<typeof loadRoutes>>
  try {
    loaded = await loadRoutes(collectionId)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'No se pudo leer la colección'
    }
  }
  if (loaded.routes.length === 0) return { ok: false, error: 'La colección no tiene peticiones' }

  const server = createServer(makeHandler(compileRoutes(loaded.routes), loaded.basePath))
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => reject(err)
      server.once('error', onError)
      // Solo 127.0.0.1: el mock no debe quedar expuesto a la red local
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError)
        resolve()
      })
    })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return {
      ok: false,
      error: code === 'EADDRINUSE' ? `El puerto ${port} ya está en uso` : (err as Error).message
    }
  }

  const routes: MockRouteInfo[] = loaded.routes.map(({ method, path, status }) => ({
    method,
    path,
    status
  }))
  running = { server, collectionId, port, routes }
  return { ok: true, port, routes }
}

export function registerMockHandlers(): void {
  ipcMain.handle('mock:start', (_e, collectionId: string, port: number) =>
    startMock(String(collectionId), Number(port))
  )
  ipcMain.handle('mock:stop', () => stopMock())
  ipcMain.handle(
    'mock:status',
    (): MockStatus =>
      running
        ? {
            running: true,
            collectionId: running.collectionId,
            port: running.port,
            routes: running.routes
          }
        : { running: false }
  )
}