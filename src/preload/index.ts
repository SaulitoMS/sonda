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
  pickFolder: () => ipcRenderer.invoke('files:pickFolder'),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (name) => ipcRenderer.invoke('collections:create', name),
  deleteCollection: (id) => ipcRenderer.invoke('collections:delete', id),
  duplicateCollection: (id) => ipcRenderer.invoke('collections:duplicate', id),
  duplicateFolder: (collectionId, folder) =>
    ipcRenderer.invoke('collections:duplicateFolder', collectionId, folder),
  renameCollection: (id, name) => ipcRenderer.invoke('collections:rename', id, name),
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
  setScopeScripts: (collectionId, folder, scripts) =>
    ipcRenderer.invoke('collections:setScripts', collectionId, folder, scripts),
  setCollectionVariables: (collectionId, variables) =>
    ipcRenderer.invoke('collections:setVariables', collectionId, variables),
  openWorkspace: () => ipcRenderer.invoke('collections:openWorkspace'),
  importSwagger: (url) => ipcRenderer.invoke('swagger:import', url),
  importPostman: () => ipcRenderer.invoke('postman:import'),
  exportPostman: (id) => ipcRenderer.invoke('postman:export', id),
  exportInsomnia: (id) => ipcRenderer.invoke('insomnia:export', id),
  exportHttp: (id) => ipcRenderer.invoke('http:export', id),
  exportDocs: (id) => ipcRenderer.invoke('docs:export', id),
  exportOpenApi: (id) => ipcRenderer.invoke('openapi:export', id),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  loadEnvironments: () => ipcRenderer.invoke('environments:load'),
  saveEnvironments: (data) => ipcRenderer.invoke('environments:save', data),
  previewSync: (id) => ipcRenderer.invoke('swagger:previewSync', id),
  applySync: (id, options) => ipcRenderer.invoke('swagger:applySync', id, options),
  listCookies: () => ipcRenderer.invoke('cookies:list'),
  deleteCookie: (id) => ipcRenderer.invoke('cookies:delete', id),
  clearCookies: () => ipcRenderer.invoke('cookies:clear'),
  setCookie: (input) => ipcRenderer.invoke('cookies:set', input),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  startMock: (collectionId, port, chaos) =>
    ipcRenderer.invoke('mock:start', collectionId, port, chaos),
  stopMock: () => ipcRenderer.invoke('mock:stop'),
  getMockStatus: () => ipcRenderer.invoke('mock:status'),
  getMockLog: () => ipcRenderer.invoke('mock:log'),
  clearMockLog: () => ipcRenderer.invoke('mock:clearLog'),
  getMockRoute: (key) => ipcRenderer.invoke('mock:getRoute', key),
  setMockOverride: (key, override) => ipcRenderer.invoke('mock:setOverride', key, override),
  runScript: (input) => ipcRenderer.invoke('script:run', input),
  oauthAuthorize: (input) => ipcRenderer.invoke('oauth:authorize', input),
  sendWebhook: (url, payload) => ipcRenderer.invoke('webhook:send', url, payload),
  wsConnect: (input) => ipcRenderer.invoke('ws:connect', input),
  wsSend: (id, data, binary) => ipcRenderer.invoke('ws:send', id, data, binary),
  wsClose: (id) => ipcRenderer.invoke('ws:close', id),
  listSavedWebSockets: () => ipcRenderer.invoke('wsSaved:list'),
  readSavedWebSocket: (path) => ipcRenderer.invoke('wsSaved:read', path),
  saveWebSocket: (collectionId, data, path) =>
    ipcRenderer.invoke('wsSaved:save', collectionId, data, path),
  deleteSavedWebSocket: (path) => ipcRenderer.invoke('wsSaved:delete', path),
  listTrash: () => ipcRenderer.invoke('trash:list'),
  restoreFromTrash: (id) => ipcRenderer.invoke('trash:restore', id),
  emptyTrash: () => ipcRenderer.invoke('trash:empty'),
  gitStatus: () => ipcRenderer.invoke('git:status'),
  gitInit: () => ipcRenderer.invoke('git:init'),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitDiff: (path) => ipcRenderer.invoke('git:diff', path),
  gitDiscard: (path) => ipcRenderer.invoke('git:discard', path),
  inspectHost: (target) => ipcRenderer.invoke('host:inspect', target),
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
