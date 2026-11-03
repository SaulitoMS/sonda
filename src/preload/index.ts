import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { SondaApi, StreamChunk } from '../shared/types'
import type { WsEvent } from '../shared/websocket'
import { electronAPI } from '@electron-toolkit/preload'

const api: SondaApi = {
  sendRequest: (input) => ipcRenderer.invoke('http:send', input),
  cancelRequest: (requestId) => ipcRenderer.invoke('http:cancel', requestId),
  onStream: (listener) => {
    const handler = (_event: IpcRendererEvent, msg: StreamChunk): void => listener(msg)
    ipcRenderer.on('http:stream', handler)
    return () => {
      ipcRenderer.removeListener('http:stream', handler)
    }
  },
  pickFile: () => ipcRenderer.invoke('files:pick'),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (name) => ipcRenderer.invoke('collections:create', name),
  deleteCollection: (id) => ipcRenderer.invoke('collections:delete', id),
  readRequest: (path) => ipcRenderer.invoke('collections:readRequest', path),
  saveRequest: (input) => ipcRenderer.invoke('collections:saveRequest', input),
  deleteRequest: (path) => ipcRenderer.invoke('collections:deleteRequest', path),
  moveRequest: (path, collectionId, folder) =>
    ipcRenderer.invoke('collections:moveRequest', path, collectionId, folder),
  moveFolder: (collectionId, folder, targetCollectionId) =>
    ipcRenderer.invoke('collections:moveFolder', collectionId, folder, targetCollectionId),
  reorderCollections: (ids) => ipcRenderer.invoke('collections:reorder', ids),
  reorderItems: (collectionId, folder, names) =>
    ipcRenderer.invoke('collections:reorderItems', collectionId, folder, names),
  setScopeAuth: (collectionId, folder, auth) =>
    ipcRenderer.invoke('collections:setAuth', collectionId, folder, auth),
  setScopeHeaders: (collectionId, folder, headers) =>
    ipcRenderer.invoke('collections:setHeaders', collectionId, folder, headers),
  setCollectionVariables: (collectionId, variables) =>
    ipcRenderer.invoke('collections:setVariables', collectionId, variables),
  openWorkspace: () => ipcRenderer.invoke('collections:openWorkspace'),
  importSwagger: (url) => ipcRenderer.invoke('swagger:import', url),
  importPostman: () => ipcRenderer.invoke('postman:import'),
  exportPostman: (id) => ipcRenderer.invoke('postman:export', id),
  exportDocs: (id) => ipcRenderer.invoke('docs:export', id),
  exportOpenApi: (id) => ipcRenderer.invoke('openapi:export', id),
  loadEnvironments: () => ipcRenderer.invoke('environments:load'),
  saveEnvironments: (data) => ipcRenderer.invoke('environments:save', data),
  previewSync: (id) => ipcRenderer.invoke('swagger:previewSync', id),
  applySync: (id, options) => ipcRenderer.invoke('swagger:applySync', id, options),
  listCookies: () => ipcRenderer.invoke('cookies:list'),
  deleteCookie: (id) => ipcRenderer.invoke('cookies:delete', id),
  clearCookies: () => ipcRenderer.invoke('cookies:clear'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  startMock: (collectionId, port) => ipcRenderer.invoke('mock:start', collectionId, port),
  stopMock: () => ipcRenderer.invoke('mock:stop'),
  getMockStatus: () => ipcRenderer.invoke('mock:status'),
  runScript: (input) => ipcRenderer.invoke('script:run', input),
  wsConnect: (input) => ipcRenderer.invoke('ws:connect', input),
  wsSend: (id, data, binary) => ipcRenderer.invoke('ws:send', id, data, binary),
  wsClose: (id) => ipcRenderer.invoke('ws:close', id),
  listSavedWebSockets: () => ipcRenderer.invoke('wsSaved:list'),
  readSavedWebSocket: (path) => ipcRenderer.invoke('wsSaved:read', path),
  saveWebSocket: (collectionId, data, path) =>
    ipcRenderer.invoke('wsSaved:save', collectionId, data, path),
  deleteSavedWebSocket: (path) => ipcRenderer.invoke('wsSaved:delete', path),
  onWsEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, msg: WsEvent): void => listener(msg)
    ipcRenderer.on('ws:event', handler)
    return () => {
      ipcRenderer.removeListener('ws:event', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define en index.d.ts)
  window.electron = electronAPI
  // @ts-ignore (define en index.d.ts)
  window.api = api
}
