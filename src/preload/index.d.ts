import { ElectronAPI } from '@electron-toolkit/preload'
import type { SondaApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: SondaApi
  }
}