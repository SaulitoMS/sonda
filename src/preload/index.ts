import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SendRequestInput, SendRequestResult } from '../shared/types'

const api = {
  sendRequest: (input: SendRequestInput): Promise<SendRequestResult> =>
    ipcRenderer.invoke('http:send', input)
}

export type Api = typeof api

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