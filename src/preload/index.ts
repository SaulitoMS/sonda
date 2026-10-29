import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SondaApi } from '../shared/types'

const api: SondaApi = {
  sendRequest: (input) => ipcRenderer.invoke('http:send', input),
  listCollections: () => ipcRenderer.invoke('collections:list'),
  createCollection: (name) => ipcRenderer.invoke('collections:create', name),
  deleteCollection: (id) => ipcRenderer.invoke('collections:delete', id),
  readRequest: (path) => ipcRenderer.invoke('collections:readRequest', path),
  saveRequest: (input) => ipcRenderer.invoke('collections:saveRequest', input),
  deleteRequest: (path) => ipcRenderer.invoke('collections:deleteRequest', path),
  openWorkspace: () => ipcRenderer.invoke('collections:openWorkspace'),
  importSwagger: (url) => ipcRenderer.invoke('swagger:import', url)
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